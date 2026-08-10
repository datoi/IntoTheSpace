// Missions, achievements, milestones, daily/weekly challenges and login rewards.
//
// All five are the SAME idea wearing different clothes: a threshold over a stat
// counter, plus a reward. So there is one objective model here and one evaluator,
// and the five features differ only in where their objectives come from and how
// progress is scoped:
//
//   ACHIEVEMENTS  fixed catalog, lifetime scope, never reset
//   MILESTONES    fixed catalog, lifetime scope, high-water metrics
//   MISSIONS      fixed ordered campaign, three shown at a time
//   DAILY/WEEKLY  generated from a date seed, reset on the period boundary
//   LOGIN         not an objective at all — a streak calendar
//
// Everything is pure. The clock and the RNG are injected, because "what are
// today's challenges" and "did the streak break" are exactly the questions that
// are untestable if they read the wall clock directly.

import type { IconName } from '../components/Icon';
import { Price, StatDelta, StatKey, Stats, HIGH_WATER_STATS } from './progression';

// --- Objectives --------------------------------------------------------------

/**
 * `lifetime` measures the forever counter; `run` measures the best SINGLE run.
 *
 * The distinction matters: "destroy 500 enemies" is a grind across many runs,
 * while "destroy 40 enemies in one run" is a skill check. Both are the same
 * metric — only the scope differs.
 */
export type ObjectiveScope = 'lifetime' | 'run';

export interface Objective {
  metric: StatKey;
  target: number;
  scope: ObjectiveScope;
}

export interface Reward {
  currencies?: Price;
  /** Ship id granted outright. */
  ship?: string;
  /** Background id granted outright. */
  background?: string;
}

/** A named, rewardable goal. `id` is the persistence key — never reuse one. */
export interface Quest {
  id: string;
  name: string;
  desc: string;
  icon: IconName;
  objective: Objective;
  reward: Reward;
}

export const objectiveOf = (metric: StatKey, target: number, scope: ObjectiveScope = 'lifetime'): Objective => ({
  metric,
  target,
  scope,
});

/**
 * How far along an objective is.
 *
 * Lifetime objectives read the forever counter directly — which is why
 * achievements need no stored progress at all, only a record of what's been
 * claimed. Run-scoped objectives read `runBests`, the per-objective high score
 * the quest state accumulates.
 */
export function progressOf(obj: Objective, lifetime: Stats, runBests: Record<string, number>, questId: string): number {
  const raw = obj.scope === 'lifetime' ? lifetime[obj.metric] : (runBests[questId] ?? 0);
  return Math.max(0, Math.min(obj.target, raw));
}

export const isComplete = (
  obj: Objective,
  lifetime: Stats,
  runBests: Record<string, number>,
  questId: string
): boolean => progressOf(obj, lifetime, runBests, questId) >= obj.target;

/** 0..1, for a progress bar. */
export const progressFrac = (
  obj: Objective,
  lifetime: Stats,
  runBests: Record<string, number>,
  questId: string
): number => (obj.target <= 0 ? 1 : progressOf(obj, lifetime, runBests, questId) / obj.target);

// --- Metric labels -----------------------------------------------------------
// Used to describe a GENERATED objective (daily/weekly), where there's no
// hand-written blurb to fall back on.

export const METRIC_LABELS: Partial<Record<StatKey, string>> = {
  kills: 'enemies destroyed',
  eliteKills: 'elite enemies destroyed',
  bossKills: 'bosses defeated',
  miniBossKills: 'mini bosses defeated',
  giantBossKills: 'giant bosses defeated',
  coinsCollected: 'coins collected',
  crystalsCollected: 'crystals collected',
  pickupsCollected: 'pick-ups grabbed',
  heartsCollected: 'hearts collected',
  bombsUsed: 'bombs detonated',
  specialsUsed: 'specials fired',
  highestWave: 'waves reached',
  bestAltitude: 'metres climbed',
  totalAltitude: 'metres climbed',
  timePlayed: 'seconds survived',
  damageDealt: 'damage dealt',
  shotsFired: 'shots fired',
  flawlessWaves: 'waves cleared without a scratch',
  perfectBosses: 'bosses beaten without a scratch',
  runs: 'runs flown',
  upgradesBought: 'upgrades bought',
};

export const describeObjective = (obj: Objective): string => {
  const label = METRIC_LABELS[obj.metric] ?? obj.metric;
  const suffix = obj.scope === 'run' ? ' in a single run' : '';
  return `${obj.target} ${label}${suffix}`;
};

// --- Achievements ------------------------------------------------------------
// Lifetime, permanent, never reset. Progress is read straight off Stats, so the
// only thing persisted is which have had their reward collected.

export const ACHIEVEMENTS: Quest[] = [
  { id: 'ach-first-blood', name: 'First Blood', icon: 'objectives', desc: 'Destroy your first enemy.', objective: objectiveOf('kills', 1), reward: { currencies: { coins: 20 } } },
  { id: 'ach-kills-100', name: 'Exterminator', icon: 'damage-up', desc: 'Destroy 100 enemies.', objective: objectiveOf('kills', 100), reward: { currencies: { coins: 80 } } },
  { id: 'ach-kills-1000', name: 'Swarm Breaker', icon: 'rocket', desc: 'Destroy 1,000 enemies.', objective: objectiveOf('kills', 1000), reward: { currencies: { coins: 400, chips: 4 } } },
  { id: 'ach-kills-10000', name: 'Void Reaper', icon: 'skull', desc: 'Destroy 10,000 enemies.', objective: objectiveOf('kills', 10000), reward: { currencies: { coins: 2500, crystals: 12, alloy: 3 } } },
  { id: 'ach-elite-50', name: 'Elite Hunter', icon: 'star', desc: 'Destroy 50 elite enemies.', objective: objectiveOf('eliteKills', 50), reward: { currencies: { coins: 250, crystals: 4 } } },
  { id: 'ach-boss-1', name: 'Giant Slayer', icon: 'boss', desc: 'Defeat your first boss.', objective: objectiveOf('bossKills', 1), reward: { currencies: { coins: 50 } } },
  { id: 'ach-boss-25', name: 'Boss Breaker', icon: 'boss', desc: 'Defeat 25 bosses.', objective: objectiveOf('bossKills', 25), reward: { currencies: { coins: 300, chips: 6 } } },
  { id: 'ach-boss-100', name: 'Fleet Ender', icon: 'crown', desc: 'Defeat 100 bosses.', objective: objectiveOf('bossKills', 100), reward: { currencies: { coins: 1500, crystals: 10, alloy: 2 } } },
  { id: 'ach-perfect-boss', name: 'Untouchable', icon: 'flawless', desc: 'Beat a boss without losing a heart.', objective: objectiveOf('perfectBosses', 1), reward: { currencies: { coins: 120, chips: 2 } } },
  { id: 'ach-perfect-boss-10', name: 'Flawless Record', icon: 'medal', desc: 'Beat 10 bosses without losing a heart.', objective: objectiveOf('perfectBosses', 10), reward: { currencies: { coins: 600, crystals: 6 } } },
  { id: 'ach-flawless-25', name: 'Not A Scratch', icon: 'shield', desc: 'Clear 25 waves without taking a hit.', objective: objectiveOf('flawlessWaves', 25), reward: { currencies: { coins: 400, chips: 5 } } },
  { id: 'ach-runs-10', name: 'Getting Started', icon: 'rocket', desc: 'Fly 10 runs.', objective: objectiveOf('runs', 10), reward: { currencies: { coins: 60 } } },
  { id: 'ach-runs-100', name: 'Career Pilot', icon: 'medal', desc: 'Fly 100 runs.', objective: objectiveOf('runs', 100), reward: { currencies: { coins: 700, chips: 8 } } },
  { id: 'ach-wave-25', name: 'Deep Space', icon: 'altitude-surge', desc: 'Reach wave 25.', objective: objectiveOf('highestWave', 25), reward: { currencies: { coins: 300, chips: 4 } } },
  { id: 'ach-wave-50', name: 'Far From Home', icon: 'altitude-surge', desc: 'Reach wave 50.', objective: objectiveOf('highestWave', 50), reward: { currencies: { coins: 900, crystals: 8, alloy: 1 } } },
  { id: 'ach-upgrades-25', name: 'Engineer', icon: 'wrench', desc: 'Buy 25 permanent upgrades.', objective: objectiveOf('upgradesBought', 25), reward: { currencies: { coins: 500, chips: 6 } } },
  { id: 'ach-bombs-50', name: 'Demolitionist', icon: 'bomb', desc: 'Detonate 50 bombs.', objective: objectiveOf('bombsUsed', 50), reward: { currencies: { coins: 200, chips: 3 } } },
  { id: 'ach-specials-100', name: 'Overdrive', icon: 'energy-cell', desc: 'Fire 100 ship specials.', objective: objectiveOf('specialsUsed', 100), reward: { currencies: { coins: 350, crystals: 3 } } },
  { id: 'ach-coins-5000', name: 'Prospector', icon: 'coin', desc: 'Collect 5,000 coins.', objective: objectiveOf('coinsCollected', 5000), reward: { currencies: { coins: 500, chips: 5 } } },
  { id: 'ach-pickups-250', name: 'Magpie', icon: 'magnet', desc: 'Grab 250 pick-ups.', objective: objectiveOf('pickupsCollected', 250), reward: { currencies: { coins: 250, chips: 3 } } },
];

// --- Milestones --------------------------------------------------------------
// Endless-progression rewards on high-water metrics. Separated from achievements
// so the UI can present "how far have I got" apart from "what have I done".

export const MILESTONES: Quest[] = [
  { id: 'ms-alt-5000', name: '5 km', icon: 'altitude-surge', desc: 'Climb 5,000m in one run.', objective: objectiveOf('bestAltitude', 5000), reward: { currencies: { coins: 100 } } },
  { id: 'ms-alt-15000', name: '15 km', icon: 'altitude-surge', desc: 'Climb 15,000m in one run.', objective: objectiveOf('bestAltitude', 15000), reward: { currencies: { coins: 300, chips: 3 } } },
  { id: 'ms-alt-30000', name: '30 km', icon: 'altitude-surge', desc: 'Climb 30,000m in one run.', objective: objectiveOf('bestAltitude', 30000), reward: { currencies: { coins: 800, crystals: 5 } } },
  { id: 'ms-alt-60000', name: '60 km', icon: 'altitude-surge', desc: 'Climb 60,000m in one run.', objective: objectiveOf('bestAltitude', 60000), reward: { currencies: { coins: 2000, crystals: 12, alloy: 2 } } },
  { id: 'ms-wave-10', name: 'Wave 10', icon: 'wave', desc: 'Reach wave 10.', objective: objectiveOf('highestWave', 10), reward: { currencies: { coins: 120 } } },
  { id: 'ms-wave-20', name: 'Wave 20', icon: 'wave', desc: 'Reach wave 20.', objective: objectiveOf('highestWave', 20), reward: { currencies: { coins: 250, chips: 3 } } },
  { id: 'ms-wave-35', name: 'Wave 35', icon: 'wave', desc: 'Reach wave 35.', objective: objectiveOf('highestWave', 35), reward: { currencies: { coins: 700, crystals: 5 } } },
  { id: 'ms-time-3600', name: 'An Hour Out', icon: 'timer', desc: 'Play for one hour in total.', objective: objectiveOf('timePlayed', 3600), reward: { currencies: { coins: 200, chips: 2 } } },
  { id: 'ms-time-18000', name: 'Five Hours Out', icon: 'timer', desc: 'Play for five hours in total.', objective: objectiveOf('timePlayed', 18000), reward: { currencies: { coins: 800, crystals: 6 } } },
  { id: 'ms-kills-500', name: '500 Down', icon: 'objectives', desc: 'Destroy 500 enemies in total.', objective: objectiveOf('kills', 500), reward: { currencies: { coins: 200, chips: 2 } } },
];

// --- Mission campaign --------------------------------------------------------
// An ordered list; the screen shows the next few uncompleted ones. Ordered
// rather than a random pool so the difficulty ramps and a new player always has
// something achievable in front of them.

export const MISSIONS: Quest[] = [
  { id: 'm01', name: 'Opening Salvo', icon: 'objectives', desc: 'Destroy 25 enemies.', objective: objectiveOf('kills', 25), reward: { currencies: { coins: 40 } } },
  { id: 'm02', name: 'Pocket Change', icon: 'coin', desc: 'Collect 100 coins.', objective: objectiveOf('coinsCollected', 100), reward: { currencies: { coins: 50 } } },
  { id: 'm03', name: 'Hold The Line', icon: 'wave', desc: 'Reach wave 5 in a single run.', objective: objectiveOf('highestWave', 5, 'run'), reward: { currencies: { coins: 60 } } },
  { id: 'm04', name: 'First Contact', icon: 'boss', desc: 'Defeat a boss.', objective: objectiveOf('bossKills', 1), reward: { currencies: { coins: 80, chips: 1 } } },
  { id: 'm05', name: 'Field Testing', icon: 'gift', desc: 'Grab 20 pick-ups.', objective: objectiveOf('pickupsCollected', 20), reward: { currencies: { coins: 70 } } },
  { id: 'm06', name: 'Bombs Away', icon: 'bomb', desc: 'Detonate 5 bombs.', objective: objectiveOf('bombsUsed', 5), reward: { currencies: { coins: 90 } } },
  { id: 'm07', name: 'Endurance', icon: 'timer', desc: 'Survive 3 minutes in a single run.', objective: objectiveOf('timePlayed', 180, 'run'), reward: { currencies: { coins: 120, chips: 1 } } },
  { id: 'm08', name: 'Workshop', icon: 'wrench', desc: 'Buy 3 permanent upgrades.', objective: objectiveOf('upgradesBought', 3), reward: { currencies: { coins: 100 } } },
  { id: 'm09', name: 'Sharp Shooting', icon: 'damage-up', desc: 'Destroy 40 enemies in a single run.', objective: objectiveOf('kills', 40, 'run'), reward: { currencies: { coins: 150, chips: 2 } } },
  { id: 'm10', name: 'Ten Waves Deep', icon: 'wave', desc: 'Reach wave 10 in a single run.', objective: objectiveOf('highestWave', 10, 'run'), reward: { currencies: { coins: 180, chips: 2 } } },
  { id: 'm11', name: 'Elite Problem', icon: 'star', desc: 'Destroy 10 elite enemies.', objective: objectiveOf('eliteKills', 10), reward: { currencies: { coins: 200, crystals: 1 } } },
  { id: 'm12', name: 'Boss Rush', icon: 'boss', desc: 'Defeat 3 bosses in a single run.', objective: objectiveOf('bossKills', 3, 'run'), reward: { currencies: { coins: 260, chips: 3 } } },
  { id: 'm13', name: 'Clean Sweep', icon: 'flawless', desc: 'Clear 5 waves without taking a hit.', objective: objectiveOf('flawlessWaves', 5), reward: { currencies: { coins: 240, crystals: 2 } } },
  { id: 'm14', name: 'High Climber', icon: 'altitude-surge', desc: 'Climb 12,000m in a single run.', objective: objectiveOf('bestAltitude', 12000, 'run'), reward: { currencies: { coins: 300, chips: 3 } } },
  { id: 'm15', name: 'Ultimate Power', icon: 'energy-cell', desc: 'Fire 25 ship specials.', objective: objectiveOf('specialsUsed', 25), reward: { currencies: { coins: 280, crystals: 2 } } },
  { id: 'm16', name: 'Veteran', icon: 'medal', desc: 'Fly 25 runs.', objective: objectiveOf('runs', 25), reward: { currencies: { coins: 350, chips: 4 } } },
  { id: 'm17', name: 'Deep Run', icon: 'altitude-surge', desc: 'Reach wave 20 in a single run.', objective: objectiveOf('highestWave', 20, 'run'), reward: { currencies: { coins: 450, crystals: 4 } } },
  { id: 'm18', name: 'Untouched', icon: 'shield', desc: 'Beat 3 bosses without losing a heart.', objective: objectiveOf('perfectBosses', 3), reward: { currencies: { coins: 500, crystals: 5, alloy: 1 } } },
  { id: 'm19', name: 'Fortune', icon: 'crystal', desc: 'Collect 25 crystals.', objective: objectiveOf('crystalsCollected', 25), reward: { currencies: { coins: 600, chips: 6 } } },
  { id: 'm20', name: 'Ace Pilot', icon: 'crown', desc: 'Reach wave 35 in a single run.', objective: objectiveOf('highestWave', 35, 'run'), reward: { currencies: { coins: 1000, crystals: 10, alloy: 2 } } },
];

/** How many campaign missions are offered at once. */
export const ACTIVE_MISSIONS = 3;

// --- Seeded generation (daily / weekly) --------------------------------------

/**
 * mulberry32 — a small, fast, well-distributed PRNG.
 *
 * Seeded generation is the whole point: the same day must produce the same
 * challenges on every device and every relaunch, so they cannot be re-rolled by
 * restarting the app, and so the tests are deterministic.
 */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Local day index. Local, not UTC: "today" should mean the player's today. */
export function dayIndex(now: number): number {
  const d = new Date(now);
  // Rebuilt from local Y/M/D so the result is a calendar day, not a 24h bucket
  // offset by the time of day.
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

/** ISO-ish week index, derived from the day index so the two always agree. */
export const weekIndex = (now: number): number => Math.floor(dayIndex(now) / 7);

export const dailyKey = (now: number): string => `d${dayIndex(now)}`;
export const weeklyKey = (now: number): string => `w${weekIndex(now)}`;

/** Short headline for a generated challenge, e.g. "Enemies Destroyed". */
function titleFor(metric: StatKey): string {
  const label = METRIC_LABELS[metric] ?? metric;
  return label.replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ChallengeTemplate {
  metric: StatKey;
  icon: IconName;
  /** Candidate targets, easiest first. */
  targets: number[];
  scope: ObjectiveScope;
}

// Daily challenges are single-run or small-grind goals: achievable in a sitting.
const DAILY_TEMPLATES: ChallengeTemplate[] = [
  { metric: 'kills', icon: 'objectives', targets: [40, 60, 90], scope: 'run' },
  { metric: 'coinsCollected', icon: 'coin', targets: [60, 100, 160], scope: 'run' },
  { metric: 'highestWave', icon: 'wave', targets: [6, 9, 13], scope: 'run' },
  { metric: 'bossKills', icon: 'boss', targets: [1, 2, 3], scope: 'run' },
  { metric: 'pickupsCollected', icon: 'gift', targets: [8, 14, 20], scope: 'run' },
  { metric: 'bombsUsed', icon: 'bomb', targets: [2, 4, 6], scope: 'run' },
  { metric: 'specialsUsed', icon: 'energy-cell', targets: [4, 8, 12], scope: 'run' },
  { metric: 'bestAltitude', icon: 'altitude-surge', targets: [6000, 10000, 16000], scope: 'run' },
  { metric: 'eliteKills', icon: 'star', targets: [3, 6, 10], scope: 'run' },
  { metric: 'flawlessWaves', icon: 'flawless', targets: [2, 3, 5], scope: 'run' },
  { metric: 'timePlayed', icon: 'timer', targets: [120, 210, 300], scope: 'run' },
  { metric: 'heartsCollected', icon: 'hull', targets: [3, 5, 8], scope: 'run' },
];

// Weekly challenges are lifetime grinds — bigger numbers, better payouts.
const WEEKLY_TEMPLATES: ChallengeTemplate[] = [
  { metric: 'kills', icon: 'objectives', targets: [600, 1000, 1600], scope: 'lifetime' },
  { metric: 'bossKills', icon: 'boss', targets: [12, 20, 30], scope: 'lifetime' },
  { metric: 'coinsCollected', icon: 'coin', targets: [900, 1500, 2400], scope: 'lifetime' },
  { metric: 'eliteKills', icon: 'star', targets: [40, 70, 110], scope: 'lifetime' },
  { metric: 'runs', icon: 'rocket', targets: [12, 20, 30], scope: 'lifetime' },
  { metric: 'totalAltitude', icon: 'altitude-surge', targets: [90000, 150000, 240000], scope: 'lifetime' },
  { metric: 'perfectBosses', icon: 'shield', targets: [3, 6, 10], scope: 'lifetime' },
  { metric: 'flawlessWaves', icon: 'flawless', targets: [15, 25, 40], scope: 'lifetime' },
];

export const DAILY_COUNT = 3;
export const WEEKLY_COUNT = 2;

/**
 * Build one period's challenges.
 *
 * Weekly objectives are LIFETIME-scoped, which would make them permanently
 * complete for a veteran player — so their target is offset by the lifetime
 * total at the moment the week began (`baseline`). That turns "destroy 1,000
 * enemies" into "destroy 1,000 MORE enemies", which is what a weekly challenge
 * has to mean.
 */
function buildChallenges(
  templates: ChallengeTemplate[],
  count: number,
  seed: number,
  rewardScale: number,
  baseline: Stats | undefined,
  idPrefix: string
): Quest[] {
  const rng = seededRng(seed);
  const pool = [...templates];
  const out: Quest[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    // Draw without replacement, so a period never lists the same metric twice.
    const [tpl] = pool.splice(Math.floor(rng() * pool.length), 1);
    const tierIdx = Math.floor(rng() * tpl.targets.length);
    const base = tpl.targets[tierIdx];
    const offset = baseline && !HIGH_WATER_STATS.has(tpl.metric) ? baseline[tpl.metric] : 0;
    const objective: Objective = { metric: tpl.metric, target: base + offset, scope: tpl.scope };
    // Reward scales with the tier drawn, so a harder roll pays better.
    const mult = 1 + tierIdx * 0.6;
    // The offset target would read as nonsense on a weekly ("destroy 51,000
    // enemies"), so both the title and the blurb quote the BASE figure — the
    // amount actually being asked for this period.
    const asked: Objective = { ...objective, target: base };
    out.push({
      id: `${idPrefix}-${i}`,
      // Short title, full sentence underneath — showing the same string in both
      // slots reads as a rendering bug.
      name: titleFor(tpl.metric),
      desc: describeObjective(asked),
      icon: tpl.icon,
      objective,
      reward: {
        currencies: {
          coins: Math.round(rewardScale * mult),
          ...(rewardScale >= 200 ? { chips: Math.max(1, Math.round(tierIdx + 1)) } : {}),
          ...(rewardScale >= 400 ? { crystals: Math.max(1, tierIdx) } : {}),
        },
      },
    });
  }
  return out;
}

/**
 * A period's challenges, rebuilt from its stored KEY rather than a timestamp.
 *
 * The key is `d<dayIndex>` / `w<weekIndex>`, which is exactly the seed the
 * generator uses — so a period that has already ended can be reconstructed
 * long after its date has passed. That is what lets rollover see which of
 * YESTERDAY's challenges the player finished (see refreshPeriods).
 *
 * Reconstructing from a timestamp would not be safe: dayIndex is computed from
 * the LOCAL calendar date, so round-tripping an index back through a timestamp
 * lands on the wrong day in any negative UTC offset.
 */
const indexOfKey = (key: string): number | null => {
  const n = Number(key.slice(1));
  return key.length > 1 && Number.isFinite(n) ? n : null;
};

export const dailyChallengesForKey = (key: string): Quest[] => {
  const idx = indexOfKey(key);
  return idx === null ? [] : buildChallenges(DAILY_TEMPLATES, DAILY_COUNT, idx, 60, undefined, key);
};

export const weeklyChallengesForKey = (key: string, baseline: Stats): Quest[] => {
  const idx = indexOfKey(key);
  return idx === null
    ? []
    : buildChallenges(WEEKLY_TEMPLATES, WEEKLY_COUNT, idx * 7919, 400, baseline, key);
};

// The live lists go through the SAME builder as the reconstruction above, so a
// harvested reward can never disagree with the challenge the player was shown.
export const dailyChallenges = (now: number): Quest[] => dailyChallengesForKey(dailyKey(now));

export const weeklyChallenges = (now: number, baseline: Stats): Quest[] =>
  weeklyChallengesForKey(weeklyKey(now), baseline);

/**
 * The challenges currently on offer, derived from the period's STORED KEY.
 *
 * This is what every caller should use, not the `now`-based lists above. The
 * stored key is the single source of truth for which period the save is in, and
 * refreshPeriods deliberately refuses to move it backwards (see the monotonic
 * guard there). Generating the display list from `now` instead would disagree
 * with the state the moment those two diverge — a device clock wound back would
 * show yesterday's challenges while `claimed` still referred to today's, so
 * every one of them would read as unclaimed again.
 *
 * `now` is only a fallback for a save whose period has never been rolled.
 */
export const liveDailyChallenges = (quests: QuestState, now: number): Quest[] =>
  dailyChallengesForKey(quests.daily.key || dailyKey(now));

export const liveWeeklyChallenges = (quests: QuestState, now: number, lifetime: Stats): Quest[] =>
  weeklyChallengesForKey(quests.weekly.key || weeklyKey(now), quests.weekly.baseline ?? lifetime);

// --- Login rewards -----------------------------------------------------------

export const LOGIN_CYCLE = 30;

/**
 * Day N of the calendar (1-based). Escalates, with bigger drops on the weekly
 * marks so a streak has visible peaks to aim at rather than a flat ramp.
 */
export function loginReward(day: number): Reward {
  const d = Math.max(1, Math.min(LOGIN_CYCLE, Math.floor(day)));
  if (d % 30 === 0) return { currencies: { coins: 1200, crystals: 10, alloy: 2 } };
  if (d % 14 === 0) return { currencies: { coins: 600, crystals: 5, chips: 6 } };
  if (d % 7 === 0) return { currencies: { coins: 300, chips: 4 } };
  return { currencies: { coins: 40 + d * 8 } };
}

export interface LoginState {
  /** Day index of the last claim; -1 = never claimed. */
  lastClaimedDay: number;
  /** Consecutive days claimed, 1-based. 0 = nothing claimed yet. */
  streak: number;
}

export const FRESH_LOGIN: LoginState = { lastClaimedDay: -1, streak: 0 };

// Strictly FORWARD, not merely "a different day". With `!==`, winding the
// device clock back one day made today's already-collected reward claimable
// again, repeatably. lastClaimedDay is itself the high-water mark, so a single
// comparison closes it.
export const canClaimLogin = (login: LoginState, now: number): boolean =>
  dayIndex(now) > login.lastClaimedDay;

/**
 * Claim today's login reward.
 *
 * Returns the unchanged state (and no reward) if today is already claimed, so a
 * double tap — or two screens both calling this — cannot pay twice. A gap of
 * more than one day resets the streak rather than continuing it.
 */
export function claimLogin(login: LoginState, now: number): { login: LoginState; reward: Reward | null; day: number } {
  const today = dayIndex(now);
  // `<=`, not `===`: guards the same rollback canClaimLogin does, and this is
  // the one that actually pays out, so it must not rely on the caller checking.
  if (today <= login.lastClaimedDay) return { login, reward: null, day: streakDay(login) };
  const continued = login.lastClaimedDay === today - 1;
  const streak = continued ? login.streak + 1 : 1;
  const day = ((streak - 1) % LOGIN_CYCLE) + 1;
  return { login: { lastClaimedDay: today, streak }, reward: loginReward(day), day };
}

/** Which calendar day the player is on (1..LOGIN_CYCLE). */
export const streakDay = (login: LoginState): number => ((Math.max(0, login.streak - 1)) % LOGIN_CYCLE) + 1;

/** The day a claim right now would land on — what the calendar highlights. */
export function nextLoginDay(login: LoginState, now: number): number {
  if (!canClaimLogin(login, now)) return streakDay(login);
  const continued = login.lastClaimedDay === dayIndex(now) - 1;
  const streak = continued ? login.streak + 1 : 1;
  return ((streak - 1) % LOGIN_CYCLE) + 1;
}

// --- Persisted quest state ---------------------------------------------------

export interface PeriodState {
  /** Period key the stored progress belongs to (see dailyKey / weeklyKey). */
  key: string;
  /** questId → best single-run value, for run-scoped objectives. */
  runBests: Record<string, number>;
  claimed: string[];
  /** Lifetime stats when the period began — the offset for lifetime targets. */
  baseline: Stats | null;
}

export interface QuestState {
  claimed: string[]; // achievement + milestone + mission ids already paid out
  /** questId → best single-run value, for run-scoped objectives. */
  runBests: Record<string, number>;
  daily: PeriodState;
  weekly: PeriodState;
  login: LoginState;
  /**
   * Highest day / week index this save has ever seen.
   *
   * The high-water mark that stops a wound-back device clock resetting a period
   * and re-opening rewards that were already collected. See refreshPeriods.
   * Optional so older saves load unchanged — they adopt today's index on the
   * first refresh.
   */
  maxDay?: number;
  maxWeek?: number;
  /**
   * Rewards earned in a period that ended before the player collected them.
   *
   * Banked here at rollover and paid out by the app on the next render, rather
   * than granted inside this module — missions.ts owns quest state and knows
   * nothing about the wallet. Optional so older saves load unchanged.
   */
  pending?: Reward[];
}

const freshPeriod = (): PeriodState => ({ key: '', runBests: {}, claimed: [], baseline: null });

export const freshQuests = (): QuestState => ({
  claimed: [],
  runBests: {},
  daily: freshPeriod(),
  weekly: freshPeriod(),
  login: { ...FRESH_LOGIN },
});

// --- Period rollover ---------------------------------------------------------

/**
 * Most rewards a rollover may bank at once.
 *
 * A bound rather than a balance decision: pending only grows when a period
 * ends with finished-but-uncollected work, which is at most a day's and a
 * week's challenges. The cap exists so a corrupt or hand-edited save cannot
 * grow this list without limit.
 */
const MAX_PENDING = 12;

/**
 * Rewards the player FINISHED but never collected before the period ended.
 *
 * Progress is discarded at rollover by design — that is what makes a challenge
 * daily. An earned reward is a different thing: completing a daily at 23:00 and
 * opening the app next morning used to destroy it silently, which reads as
 * theft rather than as a deadline.
 */
function harvestEarned(period: PeriodState, offered: Quest[], lifetime: Stats): Reward[] {
  const out: Reward[] = [];
  for (const q of offered) {
    if (period.claimed.includes(q.id)) continue;
    if (isComplete(q.objective, lifetime, period.runBests, q.id)) out.push(q.reward);
  }
  return out;
}

/**
 * Roll the daily and weekly periods forward if the calendar has moved on.
 *
 * Called on load and after every run, so a session left open across midnight
 * still picks up the new day's challenges. Progress and claims for the old
 * period are discarded by design — that is what makes them daily — but
 * anything already EARNED is carried into `pending` first and paid out by the
 * app rather than being thrown away with the progress.
 */
export function refreshPeriods(quests: QuestState, lifetime: Stats, now: number): QuestState {
  // --- Monotonic calendar ---------------------------------------------------
  // The period may only ever move FORWARD. Winding a device clock back a day
  // otherwise changes the key, which resets `claimed`, which makes challenges
  // the player already collected claimable all over again — repeatable for as
  // long as they care to keep changing the clock.
  //
  // A forward jump is NOT preventable offline: nothing on the device can tell a
  // real day passing from a clock set forward, so that is left alone (and is
  // harmless while the game has no purchasable currency or leaderboard). This
  // guard closes the half that IS decidable, which is also the half that lets
  // the same reward be taken more than once.
  const dIdx = dayIndex(now);
  const wIdx = weekIndex(now);
  const day = quests.maxDay === undefined ? dIdx : Math.max(dIdx, quests.maxDay);
  const week = quests.maxWeek === undefined ? wIdx : Math.max(wIdx, quests.maxWeek);
  const dKey = `d${day}`;
  const wKey = `w${week}`;
  let out = quests;
  // Recorded even when nothing rolled, so the high-water mark is durable — but
  // only written when it actually moves, so an unchanged period still returns
  // the very same object and callers can rely on reference equality.
  if (out.maxDay !== day || out.maxWeek !== week) {
    out = { ...out, maxDay: day, maxWeek: week };
  }
  const earned: Reward[] = [];

  if (out.daily.key !== dKey) {
    // Only harvest a period that actually ran. A blank key is a fresh save, not
    // a day the player lived through.
    if (out.daily.key) {
      earned.push(...harvestEarned(out.daily, dailyChallengesForKey(out.daily.key), lifetime));
    }
    out = { ...out, daily: { key: dKey, runBests: {}, claimed: [], baseline: lifetime } };
  }
  if (out.weekly.key !== wKey) {
    if (out.weekly.key) {
      const base = out.weekly.baseline ?? lifetime;
      earned.push(...harvestEarned(out.weekly, weeklyChallengesForKey(out.weekly.key, base), lifetime));
    }
    out = { ...out, weekly: { key: wKey, runBests: {}, claimed: [], baseline: lifetime } };
  }

  if (earned.length) {
    // Newest kept if the cap bites — an ancient unpaid reward matters less than
    // the one the player earned last night.
    out = { ...out, pending: [...(out.pending ?? []), ...earned].slice(-MAX_PENDING) };
  }
  return out;
}

// --- Which quests are live ---------------------------------------------------

/**
 * The campaign missions on offer: the next few uncompleted ones, in order.
 *
 * Derived from the claimed set rather than a stored pointer — one source of
 * truth, so a claimed mission can never be shown again and an unclaimed one can
 * never be skipped.
 */
export function activeMissions(quests: QuestState): Quest[] {
  const out: Quest[] = [];
  for (const m of MISSIONS) {
    if (quests.claimed.includes(m.id)) continue;
    out.push(m);
    if (out.length >= ACTIVE_MISSIONS) break;
  }
  // Campaign finished: show the last few as a completed tail rather than an
  // empty screen.
  return out.length ? out : MISSIONS.slice(-ACTIVE_MISSIONS);
}

export const missionsCompleted = (quests: QuestState): number =>
  MISSIONS.filter((m) => quests.claimed.includes(m.id)).length;

// --- Folding a finished run in ----------------------------------------------

/**
 * Update run-scoped bests from a finished run.
 *
 * Run-scoped objectives can only be judged here, because "40 kills in one run"
 * is a fact about a run and nothing in the lifetime totals can reconstruct it.
 * Every live run-scoped quest records the best single run it has seen.
 */
export function applyRun(quests: QuestState, lifetime: Stats, delta: StatDelta, now: number): QuestState {
  // Roll periods FIRST, so a run finished after midnight counts toward the new
  // day rather than topping up a day that has already ended.
  const rolled = refreshPeriods(quests, lifetime, now);

  const bestOf = (bests: Record<string, number>, quests_: Quest[]): Record<string, number> => {
    let out = bests;
    for (const q of quests_) {
      if (q.objective.scope !== 'run') continue;
      const v = delta[q.objective.metric];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      if (v > (out[q.id] ?? 0)) out = { ...out, [q.id]: v };
    }
    return out;
  };

  return {
    ...rolled,
    runBests: bestOf(rolled.runBests, [...MISSIONS, ...ACHIEVEMENTS, ...MILESTONES]),
    daily: { ...rolled.daily, runBests: bestOf(rolled.daily.runBests, liveDailyChallenges(rolled, now)) },
    weekly: {
      ...rolled.weekly,
      runBests: bestOf(rolled.weekly.runBests, liveWeeklyChallenges(rolled, now, lifetime)),
    },
  };
}

// --- Claiming ----------------------------------------------------------------

export interface ClaimResult {
  quests: QuestState;
  reward: Reward | null;
}

/**
 * Claim a finished quest's reward.
 *
 * Returns `reward: null` — and leaves the state untouched — if the quest isn't
 * actually complete or has already been claimed. Every claim path funnels
 * through here so "is it complete" and "has it been paid" are checked in one
 * place rather than at each call site.
 */
export function claimQuest(
  quests: QuestState,
  quest: Quest,
  lifetime: Stats,
  bucket: 'main' | 'daily' | 'weekly'
): ClaimResult {
  const state =
    bucket === 'daily' ? quests.daily : bucket === 'weekly' ? quests.weekly : { claimed: quests.claimed, runBests: quests.runBests };
  if (state.claimed.includes(quest.id)) return { quests, reward: null };
  if (!isComplete(quest.objective, lifetime, state.runBests, quest.id)) return { quests, reward: null };

  if (bucket === 'daily') {
    return { quests: { ...quests, daily: { ...quests.daily, claimed: [...quests.daily.claimed, quest.id] } }, reward: quest.reward };
  }
  if (bucket === 'weekly') {
    return { quests: { ...quests, weekly: { ...quests.weekly, claimed: [...quests.weekly.claimed, quest.id] } }, reward: quest.reward };
  }
  return { quests: { ...quests, claimed: [...quests.claimed, quest.id] }, reward: quest.reward };
}

/** How many rewards are sitting unclaimed — drives the menu's badge. */
export function unclaimedCount(quests: QuestState, lifetime: Stats, now: number): number {
  let n = 0;
  const countIn = (list: Quest[], claimed: string[], bests: Record<string, number>) => {
    for (const q of list) {
      if (claimed.includes(q.id)) continue;
      if (isComplete(q.objective, lifetime, bests, q.id)) n++;
    }
  };
  countIn([...ACHIEVEMENTS, ...MILESTONES], quests.claimed, quests.runBests);
  countIn(activeMissions(quests), quests.claimed, quests.runBests);
  countIn(liveDailyChallenges(quests, now), quests.daily.claimed, quests.daily.runBests);
  countIn(liveWeeklyChallenges(quests, now, lifetime), quests.weekly.claimed, quests.weekly.runBests);
  if (canClaimLogin(quests.login, now)) n++;
  return n;
}

// --- Normalization (for the save file) --------------------------------------

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const numRecord = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'number' && Number.isFinite(val)) out[k] = val;
  }
  return out;
};

function normalizePeriod(raw: unknown, normStats: (v: unknown) => Stats): PeriodState {
  if (!raw || typeof raw !== 'object') return freshPeriod();
  const r = raw as Record<string, unknown>;
  return {
    key: typeof r.key === 'string' ? r.key : '',
    runBests: numRecord(r.runBests),
    claimed: strArray(r.claimed),
    // A null baseline is meaningful (never started), so it is preserved rather
    // than defaulted — refreshPeriods fills it on the next rollover.
    baseline: r.baseline && typeof r.baseline === 'object' ? normStats(r.baseline) : null,
  };
}

/**
 * Validate a stored quest blob.
 *
 * Unknown quest ids in `claimed` are KEPT on purpose: they may belong to a
 * newer build's catalog (a player rolling back), and dropping them would let a
 * reward be claimed twice.
 */
/** A whole integer, or undefined — for the optional high-water indices. */
const optInt = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : undefined;

/**
 * Rewards banked by a rollover, kept only if they still look like rewards.
 *
 * These are the one part of quest state that is owed CURRENCY, so a malformed
 * entry has to be dropped rather than passed to the wallet. Anything without a
 * recognisable payload is discarded — a lost reward is a bad day, a corrupt
 * balance is a broken save.
 */
function normalizePending(v: unknown): Reward[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: Reward[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    const reward: Reward = {};
    if (r.currencies && typeof r.currencies === 'object' && !Array.isArray(r.currencies)) {
      reward.currencies = numRecord(r.currencies) as Price;
    }
    if (typeof r.ship === 'string') reward.ship = r.ship;
    if (typeof r.background === 'string') reward.background = r.background;
    if (reward.currencies || reward.ship || reward.background) out.push(reward);
  }
  return out.length ? out.slice(-MAX_PENDING) : undefined;
}

export function normalizeQuests(raw: unknown, normStats: (v: unknown) => Stats): QuestState {
  if (!raw || typeof raw !== 'object') return freshQuests();
  const r = raw as Record<string, unknown>;
  const login = r.login && typeof r.login === 'object' ? (r.login as Record<string, unknown>) : {};
  const out: QuestState = {
    claimed: strArray(r.claimed),
    runBests: numRecord(r.runBests),
    daily: normalizePeriod(r.daily, normStats),
    weekly: normalizePeriod(r.weekly, normStats),
    login: {
      lastClaimedDay:
        typeof login.lastClaimedDay === 'number' && Number.isFinite(login.lastClaimedDay)
          ? Math.floor(login.lastClaimedDay)
          : -1,
      streak:
        typeof login.streak === 'number' && Number.isFinite(login.streak) ? Math.max(0, Math.floor(login.streak)) : 0,
    },
  };
  // Optional fields are only set when present, so a save that has never rolled
  // a period round-trips to a state without them rather than gaining `undefined`
  // keys — which is what lets the round-trip test compare by equality.
  const maxDay = optInt(r.maxDay);
  const maxWeek = optInt(r.maxWeek);
  const pending = normalizePending(r.pending);
  if (maxDay !== undefined) out.maxDay = maxDay;
  if (maxWeek !== undefined) out.maxWeek = maxWeek;
  if (pending !== undefined) out.pending = pending;
  return out;
}
