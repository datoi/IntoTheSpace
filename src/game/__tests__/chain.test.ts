/**
 * The Chain — the run's score.
 *
 * This is the balance the whole redesign rests on, so the properties that
 * matter are pinned explicitly:
 *   • the multiplier steps rather than climbs smoothly, and is capped;
 *   • letting the window lapse DECAYS one step at a time — not a cliff;
 *   • a hit drops you to ×1, never to zero;
 *   • grazing sustains a chain but cannot build one on its own;
 *   • a graze is a near miss — a bullet that actually connects is not one.
 */
import {
  CHAIN_DECAY_EVERY,
  CHAIN_MAX_MULT,
  CHAIN_STEP,
  CHAIN_WINDOW,
  GRAZE_PAD,
  GRAZE_VALUE,
  RISK_BONUS_MAX,
  SCORE_ELITE,
  SCORE_ENEMY,
  SCORE_FLAWLESS_WAVE,
  WAVE_PAR_SECONDS,
  addChain,
  breakChain,
  calloutFor,
  chainForMultiplier,
  chainWindowFrac,
  freshChain,
  grazeChain,
  isGrazing,
  killScore,
  multiplierFor,
  ribbonTotal,
  ribbonsFor,
  tickChain,
} from '../chain';

describe('multiplier curve', () => {
  it('starts at ×1 and steps up every CHAIN_STEP kills', () => {
    expect(multiplierFor(0)).toBe(1);
    expect(multiplierFor(CHAIN_STEP - 1)).toBe(1);
    expect(multiplierFor(CHAIN_STEP)).toBe(1.5);
    expect(multiplierFor(CHAIN_STEP * 2)).toBe(2);
  });

  it('is capped, however long the chain runs', () => {
    expect(multiplierFor(10_000)).toBe(CHAIN_MAX_MULT);
    expect(multiplierFor(chainForMultiplier(CHAIN_MAX_MULT))).toBe(CHAIN_MAX_MULT);
  });

  it('never returns less than ×1, even for a negative chain', () => {
    expect(multiplierFor(-5)).toBe(1);
  });

  it('chainForMultiplier is the inverse of the step curve', () => {
    for (const m of [1.5, 2, 3, 5]) {
      expect(multiplierFor(chainForMultiplier(m))).toBe(m);
    }
  });
});

describe('building and holding a chain', () => {
  it('a kill extends the chain and refreshes the window', () => {
    const c = freshChain();
    expect(addChain(c)).toBe(1);
    expect(c.chain).toBe(1);
    expect(c.chainT).toBe(CHAIN_WINDOW);
  });

  it('records the best multiplier reached', () => {
    const c = freshChain();
    for (let i = 0; i < CHAIN_STEP * 2; i++) addChain(c);
    expect(c.bestMult).toBe(2);
    breakChain(c);
    // The record survives the break — it's for the results screen.
    expect(c.bestMult).toBe(2);
  });

  it('the window fraction drains from 1 to 0', () => {
    const c = freshChain();
    addChain(c);
    expect(chainWindowFrac(c)).toBe(1);
    tickChain(c, CHAIN_WINDOW / 2);
    expect(chainWindowFrac(c)).toBeCloseTo(0.5);
    tickChain(c, CHAIN_WINDOW);
    expect(chainWindowFrac(c)).toBe(0);
  });

  it('holds steady while the window has time left', () => {
    const c = freshChain();
    for (let i = 0; i < 12; i++) addChain(c);
    tickChain(c, CHAIN_WINDOW * 0.9);
    expect(c.chain).toBe(12);
  });
});

describe('decay', () => {
  it('sheds one step at a time rather than resetting', () => {
    const c = freshChain();
    for (let i = 0; i < 12; i++) addChain(c); // ×3 (12 / 5 = 2 steps)
    expect(multiplierFor(c.chain)).toBe(2);

    tickChain(c, CHAIN_WINDOW); // window lapses
    tickChain(c, CHAIN_DECAY_EVERY); // one step shed
    expect(c.chain).toBe(10);
    tickChain(c, CHAIN_DECAY_EVERY);
    expect(c.chain).toBe(5);
    tickChain(c, CHAIN_DECAY_EVERY);
    expect(c.chain).toBe(0);
  });

  it('lands exactly on step boundaries so the multiplier moves one notch a tick', () => {
    const c = freshChain();
    for (let i = 0; i < 13; i++) addChain(c); // mid-step
    tickChain(c, CHAIN_WINDOW);
    tickChain(c, CHAIN_DECAY_EVERY);
    // 13 → 10, not 13 → 8: decay snaps to the boundary below.
    expect(c.chain).toBe(10);
  });

  it('bottoms out at zero and stays there', () => {
    const c = freshChain();
    addChain(c);
    // Ticked in frame-sized steps, as the loop does — the frame the window
    // lapses on deliberately doesn't also shed a step, so decay needs the
    // following frames to actually happen.
    for (let i = 0; i < 400; i++) tickChain(c, 1 / 60);
    expect(c.chain).toBe(0);
    expect(tickChain(c, 1 / 60)).toBe(false); // nothing left to report
  });

  it('reports a multiplier change only when one actually happens', () => {
    const c = freshChain();
    for (let i = 0; i < 10; i++) addChain(c);
    expect(tickChain(c, 0.1)).toBe(false); // window still open
    tickChain(c, CHAIN_WINDOW);
    expect(tickChain(c, CHAIN_DECAY_EVERY)).toBe(true); // ×3 → ×2
  });

  it('a kill mid-decay revives the chain instead of continuing to shed', () => {
    const c = freshChain();
    for (let i = 0; i < 10; i++) addChain(c);
    tickChain(c, CHAIN_WINDOW);
    tickChain(c, CHAIN_DECAY_EVERY * 0.5); // part-way to shedding
    addChain(c);
    expect(c.chain).toBe(11);
    expect(c.decayT).toBe(0);
  });
});

describe('breaking on a hit', () => {
  it('drops to ×1, NOT to zero', () => {
    // Losing a heart already hurts. Wiping the chain on top of it teaches
    // players to turtle, which is the opposite of what graze rewards.
    const c = freshChain();
    for (let i = 0; i < 40; i++) addChain(c);
    breakChain(c);
    expect(multiplierFor(c.chain)).toBe(1);
    expect(c.chain).toBe(0);
  });
});

describe('graze', () => {
  it('refreshes the window without adding to the chain', () => {
    const c = freshChain();
    for (let i = 0; i < 7; i++) addChain(c);
    tickChain(c, CHAIN_WINDOW * 0.9);
    grazeChain(c);
    expect(c.chain).toBe(7); // no chain gained…
    expect(c.chainT).toBeGreaterThan(0); // …but the window is alive again
  });

  it('cannot build a multiplier on its own — score still comes from kills', () => {
    const c = freshChain();
    for (let i = 0; i < 50; i++) grazeChain(c);
    expect(c.chain).toBe(0);
    expect(multiplierFor(c.chain)).toBe(1);
  });

  it('never shortens a window that is already longer', () => {
    const c = freshChain();
    addChain(c); // full window
    const before = c.chainT;
    grazeChain(c); // grazes refresh to a FRACTION of the window
    expect(c.chainT).toBe(before);
  });
});

describe('graze detection', () => {
  const box = { left: 100, right: 160, top: 400, bottom: 460 };
  const bullet = (x: number, y: number, size = 10) => ({ x, y, size });

  it('a bullet inside the box is a HIT, not a graze', () => {
    // Paying a graze for a shot that connects would reward getting shot.
    expect(isGrazing(bullet(130, 430), box)).toBe(false);
  });

  it('a bullet just outside the box grazes', () => {
    expect(isGrazing(bullet(130, box.top - 10), box)).toBe(true);
    expect(isGrazing(bullet(box.left - 10, 430), box)).toBe(true);
  });

  it('a bullet beyond the pad does not graze', () => {
    expect(isGrazing(bullet(130, box.top - GRAZE_PAD - 40), box)).toBe(false);
    expect(isGrazing(bullet(box.right + GRAZE_PAD + 40, 430), box)).toBe(false);
  });

  it('accounts for the bullet radius, so a fat shot grazes from further out', () => {
    const justOutside = box.top - GRAZE_PAD - 6;
    expect(isGrazing(bullet(130, justOutside, 4), box)).toBe(false);
    expect(isGrazing(bullet(130, justOutside, 24), box)).toBe(true);
  });

  it('honours a custom pad', () => {
    expect(isGrazing(bullet(130, box.top - 40), box, 60)).toBe(true);
    expect(isGrazing(bullet(130, box.top - 40), box, 5)).toBe(false);
  });
});

describe('scoring', () => {
  it('multiplies the base value by the chain', () => {
    expect(killScore(SCORE_ENEMY, 1)).toBe(SCORE_ENEMY);
    expect(killScore(SCORE_ENEMY, 3)).toBe(SCORE_ENEMY * 3);
  });

  it('an elite is worth several drones', () => {
    expect(SCORE_ELITE).toBeGreaterThan(SCORE_ENEMY * 2);
  });

  it('pays more for a kill higher up the screen', () => {
    // Rewards pushing forward instead of turtling at the bottom.
    const low = killScore(SCORE_ENEMY, 1, 0);
    const high = killScore(SCORE_ENEMY, 1, 1);
    expect(high).toBeGreaterThan(low);
    expect(high).toBe(Math.round(SCORE_ENEMY * RISK_BONUS_MAX));
  });

  it('clamps the risk fraction rather than trusting it', () => {
    expect(killScore(SCORE_ENEMY, 1, 5)).toBe(killScore(SCORE_ENEMY, 1, 1));
    expect(killScore(SCORE_ENEMY, 1, -5)).toBe(killScore(SCORE_ENEMY, 1, 0));
  });

  it('a graze is worth far less than a kill, so it sustains rather than farms', () => {
    expect(GRAZE_VALUE).toBeLessThan(SCORE_ENEMY);
  });
});

describe('multiplier callouts', () => {
  it('fires when a step crosses a milestone', () => {
    expect(calloutFor(2.5, 3)).toBe(3);
    expect(calloutFor(4.5, 5)).toBe(5);
  });

  it('stays silent within a band, so ordinary killing is quiet', () => {
    expect(calloutFor(3, 3.5)).toBeUndefined();
    expect(calloutFor(1, 1.5)).toBeUndefined();
  });

  it('reports only the first milestone crossed in one jump', () => {
    expect(calloutFor(1, 10)).toBe(3);
  });

  it('never fires going down', () => {
    expect(calloutFor(5, 3)).toBeUndefined();
  });
});

describe('wave-clear ribbons', () => {
  it('awards FLAWLESS for an untouched wave', () => {
    const r = ribbonsFor({ waveHits: 0, chainHeld: false, waveSeconds: 40 });
    expect(r.map((x) => x.kind)).toEqual(['flawless']);
    expect(ribbonTotal(r)).toBe(SCORE_FLAWLESS_WAVE);
  });

  it('withholds FLAWLESS once a hit lands', () => {
    const r = ribbonsFor({ waveHits: 1, chainHeld: false, waveSeconds: 40 });
    expect(r).toEqual([]);
  });

  it('awards SPEED only inside par', () => {
    expect(
      ribbonsFor({ waveHits: 1, chainHeld: false, waveSeconds: WAVE_PAR_SECONDS - 1 }).map((x) => x.kind)
    ).toEqual(['speed']);
    expect(
      ribbonsFor({ waveHits: 1, chainHeld: false, waveSeconds: WAVE_PAR_SECONDS + 1 })
    ).toEqual([]);
  });

  it('ignores a zero wave time rather than awarding a free SPEED', () => {
    // Guards the first spawn, where no wave has actually been timed yet.
    expect(ribbonsFor({ waveHits: 1, chainHeld: false, waveSeconds: 0 })).toEqual([]);
  });

  it('stacks all three on a perfect fast clear', () => {
    const r = ribbonsFor({ waveHits: 0, chainHeld: true, waveSeconds: 5 });
    expect(r.map((x) => x.kind).sort()).toEqual(['flawless', 'fullChain', 'speed']);
    expect(ribbonTotal(r)).toBeGreaterThan(SCORE_FLAWLESS_WAVE);
  });

  it('every ribbon carries a label and a positive score', () => {
    for (const r of ribbonsFor({ waveHits: 0, chainHeld: true, waveSeconds: 1 })) {
      expect(r.label).toBeTruthy();
      expect(r.score).toBeGreaterThan(0);
    }
  });
});
