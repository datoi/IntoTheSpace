/**
 * The quest engine.
 *
 * Priorities, in order of how badly a bug would hurt:
 *   1. a reward can never be paid twice, and never paid unearned;
 *   2. daily/weekly challenges are deterministic per period and reset on the
 *      boundary — a player must not be able to re-roll them by relaunching;
 *   3. run-scoped goals mean "in ONE run", not "cumulatively";
 *   4. login streaks continue, reset and refuse a second same-day claim.
 *
 * The clock is injected everywhere, so none of this depends on when it runs.
 */
import {
  ACHIEVEMENTS,
  ACTIVE_MISSIONS,
  DAILY_COUNT,
  LOGIN_CYCLE,
  MILESTONES,
  MISSIONS,
  Quest,
  QuestState,
  WEEKLY_COUNT,
  activeMissions,
  applyRun,
  canClaimLogin,
  FRESH_LOGIN,
  liveDailyChallenges,
  claimLogin,
  claimQuest,
  dailyChallenges,
  dailyChallengesForKey,
  dailyKey,
  dayIndex,
  describeObjective,
  freshQuests,
  isComplete,
  loginReward,
  missionsCompleted,
  nextLoginDay,
  normalizeQuests,
  objectiveOf,
  progressFrac,
  progressOf,
  refreshPeriods,
  seededRng,
  streakDay,
  unclaimedCount,
  weeklyChallenges,
  weeklyKey,
} from '../missions';
import { Stats, freshStats, normalizeStats } from '../progression';

const norm = (v: unknown): Stats => normalizeStats(v as Partial<Stats> | undefined);

/** A fixed local noon, so nothing straddles a day boundary by accident. */
const at = (y: number, m: number, d: number, h = 12): number => new Date(y, m - 1, d, h).getTime();
const DAY1 = at(2026, 3, 10);
const DAY2 = at(2026, 3, 11);
const DAY9 = at(2026, 3, 18);

const stats = (over: Partial<Stats> = {}): Stats => ({ ...freshStats(), ...over });

describe('objective evaluation', () => {
  const lifetime = stats({ kills: 40 });

  it('reads a lifetime objective straight off the counter', () => {
    expect(progressOf(objectiveOf('kills', 100), lifetime, {}, 'q')).toBe(40);
    expect(isComplete(objectiveOf('kills', 100), lifetime, {}, 'q')).toBe(false);
    expect(isComplete(objectiveOf('kills', 40), lifetime, {}, 'q')).toBe(true);
  });

  it('clamps progress to the target so a bar never overfills', () => {
    expect(progressOf(objectiveOf('kills', 10), lifetime, {}, 'q')).toBe(10);
    expect(progressFrac(objectiveOf('kills', 10), lifetime, {}, 'q')).toBe(1);
  });

  it('a run-scoped objective ignores the lifetime total entirely', () => {
    const obj = objectiveOf('kills', 30, 'run');
    // 40 lifetime kills must NOT satisfy "30 in a single run".
    expect(isComplete(obj, lifetime, {}, 'q')).toBe(false);
    expect(isComplete(obj, lifetime, { q: 30 }, 'q')).toBe(true);
  });

  it('a zero target is trivially complete rather than dividing by zero', () => {
    expect(progressFrac(objectiveOf('kills', 0), lifetime, {}, 'q')).toBe(1);
  });

  it('describes an objective with its scope', () => {
    expect(describeObjective(objectiveOf('kills', 25))).toBe('25 enemies destroyed');
    expect(describeObjective(objectiveOf('kills', 25, 'run'))).toBe('25 enemies destroyed in a single run');
  });
});

describe('catalog integrity', () => {
  const all: Quest[] = [...ACHIEVEMENTS, ...MILESTONES, ...MISSIONS];

  it('every quest id is unique across every catalog', () => {
    const ids = all.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every quest has a positive target and a reward', () => {
    for (const q of all) {
      expect(q.objective.target).toBeGreaterThan(0);
      expect(q.reward.currencies || q.reward.ship || q.reward.background).toBeTruthy();
      expect(q.name.length).toBeGreaterThan(2);
      expect(q.desc.length).toBeGreaterThan(5);
    }
  });

  it('every quest metric is a real stat counter', () => {
    const keys = Object.keys(freshStats());
    for (const q of all) expect(keys).toContain(q.objective.metric);
  });
});

describe('mission campaign', () => {
  it('offers the first few missions to a new player, in order', () => {
    const active = activeMissions(freshQuests());
    expect(active.length).toBe(ACTIVE_MISSIONS);
    expect(active[0].id).toBe(MISSIONS[0].id);
  });

  it('advances past claimed missions', () => {
    const q: QuestState = { ...freshQuests(), claimed: [MISSIONS[0].id, MISSIONS[1].id] };
    expect(activeMissions(q)[0].id).toBe(MISSIONS[2].id);
  });

  it('counts completions', () => {
    const q: QuestState = { ...freshQuests(), claimed: [MISSIONS[0].id, MISSIONS[3].id] };
    expect(missionsCompleted(q)).toBe(2);
  });

  it('shows a completed tail rather than an empty list once the campaign ends', () => {
    const q: QuestState = { ...freshQuests(), claimed: MISSIONS.map((m) => m.id) };
    expect(activeMissions(q).length).toBe(ACTIVE_MISSIONS);
  });
});

describe('claiming', () => {
  const q0 = freshQuests();
  const easy = ACHIEVEMENTS[0]; // 1 kill

  it('pays out a completed, unclaimed quest exactly once', () => {
    const lifetime = stats({ kills: 5 });
    const first = claimQuest(q0, easy, lifetime, 'main');
    expect(first.reward).toEqual(easy.reward);
    expect(first.quests.claimed).toContain(easy.id);

    // Second attempt on the returned state pays nothing.
    const second = claimQuest(first.quests, easy, lifetime, 'main');
    expect(second.reward).toBeNull();
    expect(second.quests).toBe(first.quests); // untouched
  });

  it('refuses to pay an incomplete quest', () => {
    const result = claimQuest(q0, easy, stats({ kills: 0 }), 'main');
    expect(result.reward).toBeNull();
    expect(result.quests.claimed).toEqual([]);
  });

  it('keeps daily, weekly and main claim buckets separate', () => {
    const lifetime = stats({ kills: 5 });
    const daily = claimQuest(q0, easy, lifetime, 'daily');
    expect(daily.quests.daily.claimed).toContain(easy.id);
    expect(daily.quests.claimed).toEqual([]);

    const weekly = claimQuest(q0, easy, lifetime, 'weekly');
    expect(weekly.quests.weekly.claimed).toContain(easy.id);
    expect(weekly.quests.claimed).toEqual([]);
  });

  it('judges a run-scoped claim against the matching bucket bests', () => {
    const runQuest = MISSIONS.find((m) => m.objective.scope === 'run')!;
    const lifetime = stats();
    // Lifetime bests empty → not claimable.
    expect(claimQuest(q0, runQuest, lifetime, 'main').reward).toBeNull();
    const withBest: QuestState = { ...q0, runBests: { [runQuest.id]: runQuest.objective.target } };
    expect(claimQuest(withBest, runQuest, lifetime, 'main').reward).toEqual(runQuest.reward);
  });
});

describe('seeded generation', () => {
  it('the PRNG is deterministic for a seed and varies across seeds', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const c = seededRng(43);
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect([c(), c(), c()]).not.toEqual(seqA);
  });

  it('produces values in [0,1)', () => {
    const r = seededRng(7);
    for (let i = 0; i < 500; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('the same day always yields the same daily challenges', () => {
    // Different times of day, same calendar day → identical challenges. This is
    // what stops a player re-rolling by relaunching the app.
    const morning = dailyChallenges(at(2026, 3, 10, 8));
    const evening = dailyChallenges(at(2026, 3, 10, 23));
    expect(evening).toEqual(morning);
  });

  it('a different day yields different daily challenges', () => {
    const a = dailyChallenges(DAY1).map((q) => `${q.objective.metric}:${q.objective.target}`);
    const b = dailyChallenges(DAY9).map((q) => `${q.objective.metric}:${q.objective.target}`);
    expect(b).not.toEqual(a);
  });

  it('issues the configured number of challenges, with distinct metrics', () => {
    const daily = dailyChallenges(DAY1);
    expect(daily.length).toBe(DAILY_COUNT);
    expect(new Set(daily.map((q) => q.objective.metric)).size).toBe(DAILY_COUNT);

    const weekly = weeklyChallenges(DAY1, freshStats());
    expect(weekly.length).toBe(WEEKLY_COUNT);
    expect(new Set(weekly.map((q) => q.objective.metric)).size).toBe(WEEKLY_COUNT);
  });

  it('daily challenge ids are namespaced by day, so yesterday cannot collide', () => {
    expect(dailyChallenges(DAY1)[0].id).toContain(dailyKey(DAY1));
    expect(dailyChallenges(DAY1)[0].id).not.toBe(dailyChallenges(DAY9)[0].id);
  });

  it('weekly targets are offset by the lifetime total at the start of the week', () => {
    // Otherwise a veteran with 50,000 kills would open the week with every
    // lifetime-scoped weekly already complete.
    const veteran = stats({ kills: 50000, coinsCollected: 90000, runs: 400, totalAltitude: 9e6 });
    for (const q of weeklyChallenges(DAY1, veteran)) {
      if (q.objective.scope !== 'lifetime') continue;
      expect(isComplete(q.objective, veteran, {}, q.id)).toBe(false);
    }
  });
});

describe('date bucketing', () => {
  const weekIndexDelta = (a: number, b: number) =>
    Number(weeklyKey(b).slice(1)) - Number(weeklyKey(a).slice(1));

  it('a day index is stable across the day and increments at midnight', () => {
    expect(dayIndex(at(2026, 3, 10, 0))).toBe(dayIndex(at(2026, 3, 10, 23)));
    expect(dayIndex(DAY2)).toBe(dayIndex(DAY1) + 1);
  });

  it('a week index advances every seven days', () => {
    expect(weeklyKey(DAY1)).toBe(weeklyKey(at(2026, 3, 10, 3)));
    expect(weekIndexDelta(DAY1, DAY9)).toBeGreaterThanOrEqual(1);
  });
});

describe('period rollover', () => {
  it('seeds the period keys and a baseline on first use', () => {
    const lifetime = stats({ kills: 10 });
    const rolled = refreshPeriods(freshQuests(), lifetime, DAY1);
    expect(rolled.daily.key).toBe(dailyKey(DAY1));
    expect(rolled.weekly.key).toBe(weeklyKey(DAY1));
    expect(rolled.weekly.baseline).toEqual(lifetime);
  });

  it('is a no-op within the same period', () => {
    const once = refreshPeriods(freshQuests(), stats(), DAY1);
    const twice = refreshPeriods(once, stats({ kills: 99 }), DAY1);
    expect(twice).toBe(once); // same reference — nothing rebuilt
  });

  it('clears daily progress and claims when the day rolls over', () => {
    let q = refreshPeriods(freshQuests(), stats(), DAY1);
    q = { ...q, daily: { ...q.daily, claimed: ['x'], runBests: { x: 5 } } };
    const next = refreshPeriods(q, stats(), DAY2);
    expect(next.daily.claimed).toEqual([]);
    expect(next.daily.runBests).toEqual({});
  });

  it('a new day does not clear the weekly period', () => {
    let q = refreshPeriods(freshQuests(), stats(), DAY1);
    q = { ...q, weekly: { ...q.weekly, claimed: ['w'] } };
    const next = refreshPeriods(q, stats(), DAY2);
    // Same week, so the weekly claim survives the daily reset.
    if (weeklyKey(DAY1) === weeklyKey(DAY2)) expect(next.weekly.claimed).toEqual(['w']);
  });

  it('re-baselines the weekly when the week rolls over', () => {
    const q = refreshPeriods(freshQuests(), stats({ kills: 5 }), DAY1);
    const later = refreshPeriods(q, stats({ kills: 900 }), at(2026, 4, 20));
    expect(later.weekly.baseline?.kills).toBe(900);
  });
});

describe('folding a run in', () => {
  it('records a run-scoped best from the run delta', () => {
    const runQuest = MISSIONS.find((m) => m.objective.metric === 'kills' && m.objective.scope === 'run')!;
    const q = applyRun(freshQuests(), stats({ kills: 60 }), { kills: 60 }, DAY1);
    expect(q.runBests[runQuest.id]).toBe(60);
  });

  it('keeps the BEST run, not the latest', () => {
    const runQuest = MISSIONS.find((m) => m.objective.metric === 'kills' && m.objective.scope === 'run')!;
    let q = applyRun(freshQuests(), stats({ kills: 60 }), { kills: 60 }, DAY1);
    q = applyRun(q, stats({ kills: 70 }), { kills: 10 }, DAY1);
    expect(q.runBests[runQuest.id]).toBe(60);
  });

  it('never lets cumulative play satisfy a single-run goal', () => {
    const runQuest = MISSIONS.find((m) => m.objective.metric === 'kills' && m.objective.scope === 'run')!;
    let q = freshQuests();
    let lifetime = stats();
    // Ten runs of 10 kills each: 100 lifetime, but never more than 10 in a run.
    for (let i = 0; i < 10; i++) {
      lifetime = stats({ kills: (i + 1) * 10 });
      q = applyRun(q, lifetime, { kills: 10 }, DAY1);
    }
    expect(q.runBests[runQuest.id]).toBe(10);
    expect(isComplete(runQuest.objective, lifetime, q.runBests, runQuest.id)).toBe(false);
  });

  it('rolls the period forward before crediting, so a post-midnight run counts to the new day', () => {
    const q = applyRun(freshQuests(), stats(), { kills: 50 }, DAY2);
    expect(q.daily.key).toBe(dailyKey(DAY2));
  });

  it('ignores a non-finite delta', () => {
    const q = applyRun(freshQuests(), stats(), { kills: NaN }, DAY1);
    expect(Object.values(q.runBests).every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe('login rewards', () => {
  it('a fresh player can claim, and lands on day 1', () => {
    const login = freshQuests().login;
    expect(canClaimLogin(login, DAY1)).toBe(true);
    expect(nextLoginDay(login, DAY1)).toBe(1);
    const { login: next, reward, day } = claimLogin(login, DAY1);
    expect(reward).not.toBeNull();
    expect(day).toBe(1);
    expect(next.streak).toBe(1);
  });

  it('refuses a second claim on the same day', () => {
    const { login } = claimLogin(freshQuests().login, DAY1);
    expect(canClaimLogin(login, DAY1)).toBe(false);
    const again = claimLogin(login, DAY1);
    expect(again.reward).toBeNull();
    expect(again.login).toBe(login); // untouched
  });

  it('continues the streak on consecutive days', () => {
    let login = claimLogin(freshQuests().login, DAY1).login;
    const second = claimLogin(login, DAY2);
    expect(second.login.streak).toBe(2);
    expect(second.day).toBe(2);
    login = second.login;
    const third = claimLogin(login, at(2026, 3, 12));
    expect(third.login.streak).toBe(3);
  });

  it('resets the streak after a missed day', () => {
    const login = claimLogin(freshQuests().login, DAY1).login;
    // Skipped the 11th entirely.
    const broken = claimLogin(login, at(2026, 3, 12));
    expect(broken.login.streak).toBe(1);
    expect(broken.day).toBe(1);
  });

  it('wraps the calendar after a full cycle', () => {
    // A streak one past the cycle lands back on day 1.
    expect(streakDay({ lastClaimedDay: 0, streak: LOGIN_CYCLE + 1 })).toBe(1);
    expect(streakDay({ lastClaimedDay: 0, streak: LOGIN_CYCLE })).toBe(LOGIN_CYCLE);
  });

  it('rewards escalate, with bigger drops on the weekly marks', () => {
    const coinsOn = (d: number) => loginReward(d).currencies?.coins ?? 0;
    expect(coinsOn(2)).toBeGreaterThan(coinsOn(1));
    expect(coinsOn(7)).toBeGreaterThan(coinsOn(6));
    expect(coinsOn(30)).toBeGreaterThan(coinsOn(14));
    // Milestone days carry deep currency too.
    expect(loginReward(7).currencies?.chips).toBeGreaterThan(0);
    expect(loginReward(30).currencies?.alloy).toBeGreaterThan(0);
  });

  it('clamps an out-of-range day rather than returning nothing', () => {
    expect(loginReward(0).currencies?.coins).toBeGreaterThan(0);
    expect(loginReward(999).currencies?.coins).toBeGreaterThan(0);
  });
});

describe('unclaimed badge', () => {
  it('is zero for a fresh player who has already logged in', () => {
    const q = { ...refreshPeriods(freshQuests(), stats(), DAY1), login: claimLogin(freshQuests().login, DAY1).login };
    expect(unclaimedCount(q, stats(), DAY1)).toBe(0);
  });

  it('counts an available login reward', () => {
    const q = refreshPeriods(freshQuests(), stats(), DAY1);
    expect(unclaimedCount(q, stats(), DAY1)).toBeGreaterThan(0);
  });

  it('counts a completed achievement and stops once claimed', () => {
    const login = claimLogin(freshQuests().login, DAY1).login;
    const base = { ...refreshPeriods(freshQuests(), stats(), DAY1), login };
    const lifetime = stats({ kills: 1 });
    const before = unclaimedCount(base, lifetime, DAY1);
    expect(before).toBeGreaterThan(0);
    const claimed = claimQuest(base, ACHIEVEMENTS[0], lifetime, 'main').quests;
    expect(unclaimedCount(claimed, lifetime, DAY1)).toBe(before - 1);
  });
});

describe('normalizeQuests', () => {
  it('returns a fresh state for junk input', () => {
    expect(normalizeQuests(null, norm)).toEqual(freshQuests());
    expect(normalizeQuests('nope', norm)).toEqual(freshQuests());
    expect(normalizeQuests(42, norm)).toEqual(freshQuests());
  });

  it('round-trips a valid state through JSON', () => {
    const q = applyRun(freshQuests(), stats({ kills: 80 }), { kills: 80 }, DAY1);
    const claimed = claimQuest(q, ACHIEVEMENTS[0], stats({ kills: 80 }), 'main').quests;
    expect(normalizeQuests(JSON.parse(JSON.stringify(claimed)), norm)).toEqual(claimed);
  });

  it('drops non-string claims and non-numeric bests', () => {
    const out = normalizeQuests(
      { claimed: ['ok', 42, null], runBests: { good: 5, bad: 'x', worse: NaN } },
      norm
    );
    expect(out.claimed).toEqual(['ok']);
    expect(out.runBests).toEqual({ good: 5 });
  });

  it('keeps an unknown claimed id — it may belong to a newer catalog', () => {
    // Dropping it would let that reward be claimed a second time after a
    // rollback and re-update.
    const out = normalizeQuests({ claimed: ['ach-from-a-future-build'] }, norm);
    expect(out.claimed).toEqual(['ach-from-a-future-build']);
  });

  it('repairs a malformed login block', () => {
    const out = normalizeQuests({ login: { lastClaimedDay: 'yesterday', streak: -5 } }, norm);
    expect(out.login.lastClaimedDay).toBe(-1);
    expect(out.login.streak).toBe(0);
  });

  it('preserves a null weekly baseline instead of inventing one', () => {
    const out = normalizeQuests({ weekly: { key: 'w1', claimed: [], runBests: {}, baseline: null } }, norm);
    expect(out.weekly.baseline).toBeNull();
  });
});

describe('period rollover — earned rewards survive, progress does not', () => {
  const DAY = 86_400_000;
  // 23:00 local, so "one hour later" is genuinely the next calendar day.
  const lateEvening = new Date(2026, 0, 15, 23, 0, 0).getTime();
  const nextMorning = new Date(2026, 0, 16, 9, 0, 0).getTime();

  /** A state where one of today's dailies is finished but uncollected. */
  const withFinishedDaily = () => {
    let q = refreshPeriods(freshQuests(), {} as Stats, lateEvening);
    const target = dailyChallenges(lateEvening).find((c) => c.objective.scope === 'run')!;
    // Record a run good enough to complete it, without claiming.
    q = { ...q, daily: { ...q.daily, runBests: { [target.id]: target.objective.target } } };
    return { quests: q, target };
  };

  it('carries a completed-but-unclaimed daily across midnight', () => {
    const { quests, target } = withFinishedDaily();
    expect(isComplete(target.objective, {} as Stats, quests.daily.runBests, target.id)).toBe(true);

    const rolled = refreshPeriods(quests, {} as Stats, nextMorning);
    expect(rolled.pending ?? []).toContainEqual(target.reward);
  });

  it('still discards PROGRESS at rollover — that is what makes it daily', () => {
    const { quests } = withFinishedDaily();
    const rolled = refreshPeriods(quests, {} as Stats, nextMorning);
    expect(rolled.daily.runBests).toEqual({});
    expect(rolled.daily.claimed).toEqual([]);
    expect(rolled.daily.key).not.toBe(quests.daily.key);
  });

  it('does not bank a reward the player already collected', () => {
    const { quests, target } = withFinishedDaily();
    const claimed = { ...quests, daily: { ...quests.daily, claimed: [target.id] } };
    const rolled = refreshPeriods(claimed, {} as Stats, nextMorning);
    expect(rolled.pending ?? []).toHaveLength(0);
  });

  it('does not bank a reward for a challenge that was never finished', () => {
    const started = refreshPeriods(freshQuests(), {} as Stats, lateEvening);
    const rolled = refreshPeriods(started, {} as Stats, nextMorning);
    expect(rolled.pending ?? []).toHaveLength(0);
  });

  it('banks nothing on a first-ever load — a blank key is not a lived day', () => {
    const rolled = refreshPeriods(freshQuests(), {} as Stats, lateEvening);
    expect(rolled.pending ?? []).toHaveLength(0);
  });

  it('is a no-op within the same day, so pending cannot accumulate on re-entry', () => {
    const { quests } = withFinishedDaily();
    const same = refreshPeriods(quests, {} as Stats, lateEvening + 60_000);
    expect(same).toBe(quests); // identical reference: nothing rolled
  });

  it('bounds the pending list against a save that never drains it', () => {
    let q = refreshPeriods(freshQuests(), {} as Stats, lateEvening);
    // Simulate many un-drained rollovers.
    for (let d = 1; d < 40; d++) {
      const target = dailyChallenges(lateEvening + (d - 1) * DAY).find(
        (c) => c.objective.scope === 'run'
      )!;
      q = { ...q, daily: { ...q.daily, runBests: { [target.id]: target.objective.target } } };
      q = refreshPeriods(q, {} as Stats, lateEvening + d * DAY);
    }
    expect((q.pending ?? []).length).toBeLessThanOrEqual(12);
  });

  it('rebuilds an ended period identically to what the player was shown', () => {
    // The harvest reconstructs yesterday's challenges from the stored key. If
    // that drifted from the live generator it would pay out rewards for
    // challenges nobody was ever offered.
    const key = dailyKey(lateEvening);
    expect(dailyChallengesForKey(key)).toEqual(dailyChallenges(lateEvening));
  });
});

describe('device-clock manipulation', () => {
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();
  const today = at(2026, 2, 10);
  const yesterday = at(2026, 2, 9);

  describe('login streak', () => {
    it('refuses a second claim after winding the clock back a day', () => {
      const first = claimLogin(FRESH_LOGIN, today);
      expect(first.reward).not.toBeNull();
      // Clock rolled back — the same day's reward must not reopen.
      expect(claimLogin(first.login, yesterday).reward).toBeNull();
      expect(canClaimLogin(first.login, yesterday)).toBe(false);
    });

    it('refuses a rollback of many days, not just one', () => {
      const first = claimLogin(FRESH_LOGIN, today);
      expect(claimLogin(first.login, at(2025, 0, 1)).reward).toBeNull();
    });

    it('does not let a rollback inflate the streak', () => {
      const day1 = claimLogin(FRESH_LOGIN, today);
      const rolledBack = claimLogin(day1.login, yesterday);
      expect(rolledBack.login.streak).toBe(day1.login.streak);
    });

    it('still pays a genuine next day', () => {
      const day1 = claimLogin(FRESH_LOGIN, yesterday);
      const day2 = claimLogin(day1.login, today);
      expect(day2.reward).not.toBeNull();
      expect(day2.login.streak).toBe(2);
    });
  });

  describe('daily challenges', () => {
    it('does not reset the period when the clock goes backwards', () => {
      const q = refreshPeriods(freshQuests(), {} as Stats, today);
      const target = dailyChallenges(today)[0];
      const claimed = { ...q, daily: { ...q.daily, claimed: [target.id] } };

      const rolledBack = refreshPeriods(claimed, {} as Stats, yesterday);
      // Same period, so the claim stands and the reward cannot be taken twice.
      expect(rolledBack.daily.key).toBe(q.daily.key);
      expect(rolledBack.daily.claimed).toContain(target.id);
    });

    it('records a high-water day so the guard survives a reload', () => {
      const q = refreshPeriods(freshQuests(), {} as Stats, today);
      expect(q.maxDay).toBe(dayIndex(today));
      // …and the mark does not regress.
      expect(refreshPeriods(q, {} as Stats, yesterday).maxDay).toBe(dayIndex(today));
    });

    it('still rolls forward normally', () => {
      const q = refreshPeriods(freshQuests(), {} as Stats, yesterday);
      const next = refreshPeriods(q, {} as Stats, today);
      expect(next.daily.key).not.toBe(q.daily.key);
      expect(next.daily.claimed).toEqual([]);
    });

    it('shows the challenges belonging to the STORED period, not the wall clock', () => {
      // Otherwise a wound-back clock would render yesterday's list while
      // `claimed` still referred to today's, so everything looks unclaimed.
      const q = refreshPeriods(freshQuests(), {} as Stats, today);
      const rolledBack = refreshPeriods(q, {} as Stats, yesterday);
      expect(liveDailyChallenges(rolledBack, yesterday)).toEqual(dailyChallenges(today));
    });
  });

  it('persists the guard and any banked rewards through a save round-trip', () => {
    // These are new optional fields; if normalizeQuests dropped them the guard
    // would reset every launch and banked rewards would silently vanish.
    let q = refreshPeriods(freshQuests(), {} as Stats, yesterday);
    q = { ...q, pending: [{ currencies: { coins: 250 } }] };
    const round = normalizeQuests(JSON.parse(JSON.stringify(q)), norm);
    expect(round.maxDay).toBe(q.maxDay);
    expect(round.maxWeek).toBe(q.maxWeek);
    expect(round.pending).toEqual([{ currencies: { coins: 250 } }]);
  });

  it('drops a malformed banked reward rather than paying it', () => {
    const round = normalizeQuests(
      { ...freshQuests(), pending: [null, 'coins', { nonsense: 1 }, { currencies: { coins: 10 } }] },
      norm
    );
    expect(round.pending).toEqual([{ currencies: { coins: 10 } }]);
  });
});
