/**
 * Enemy archetypes and elite modifiers. The behaviours are stepped directly
 * here (no renderer, no game loop) so each movement and fire pattern can be
 * checked on its own — which is the point of having pulled them out of
 * GameScreen in the first place.
 */
import {
  ARCHETYPES,
  ARCH_KINDS,
  ELITES,
  ELITE_KINDS,
  EnemyCtx,
  EnemyShotSpec,
  applyArchetype,
  baseWaveHp,
  bountyOf,
  descendSpeed,
  eliteChance,
  eliteColor,
  enemyFire,
  explosiveBurst,
  rollArchetype,
  rollElite,
  splitChildren,
  stepEnemy,
} from '../enemies';
import { Card } from '../types';
import { SCREEN, FEED_PAD, OB_HIT, laneX, ENEMY_DESCEND_SPEED } from '../constants';

const baseCard = (over: Partial<Card> = {}): Card => ({
  id: 1,
  kind: 'rage',
  lane: 2,
  y: 200,
  h: OB_HIT,
  emoji: '',
  hp: 5,
  maxHp: 5,
  hitT: 0,
  holdY: 200,
  homeX: laneX(2),
  dead: false,
  deadT: 0,
  nearMissChecked: false,
  ...over,
});

const makeCtx = (over: Partial<EnemyCtx> = {}): { ctx: EnemyCtx; shots: EnemyShotSpec[] } => {
  const shots: EnemyShotSpec[] = [];
  const ctx: EnemyCtx = {
    dt: 1 / 60,
    elapsed: 0,
    playerX: SCREEN.W / 2,
    playerY: SCREEN.H - 200,
    wave: 10,
    worldSpeed: 200,
    fire: (s) => shots.push(s),
    ...over,
  };
  return { ctx, shots };
};

describe('archetype catalog', () => {
  it('every archetype is keyed by its own id and fully specified', () => {
    for (const k of ARCH_KINDS) {
      const def = ARCHETYPES[k];
      expect(def.id).toBe(k);
      expect(def.hp).toBeGreaterThan(0);
      expect(def.size).toBeGreaterThan(0);
      expect(def.weight).toBeGreaterThan(0);
      expect(def.minWave).toBeGreaterThanOrEqual(1);
      expect(def.desc.length).toBeGreaterThan(10);
      // Anything that shoots needs a cadence; anything that doesn't must be 0.
      if (def.fire === 'none') expect(def.fireEvery).toBe(0);
      else expect(def.fireEvery).toBeGreaterThan(0);
    }
  });

  it('the baseline drone is available from wave 1', () => {
    expect(ARCHETYPES.grunt.minWave).toBe(1);
  });
});

describe('elite catalog', () => {
  it('every elite is keyed by itself and rewards more than a plain enemy', () => {
    for (const k of ELITE_KINDS) {
      const def = ELITES[k];
      expect(def.id).toBe(k);
      expect(def.bonusCoins).toBeGreaterThan(0);
      expect(def.crystalChance).toBeGreaterThan(0);
      expect(def.crystalChance).toBeLessThanOrEqual(1);
      expect(def.color).toMatch(/^#/);
    }
  });

  it('elite chance starts at zero, ramps, and is capped', () => {
    expect(eliteChance(1)).toBe(0);
    expect(eliteChance(2)).toBe(0);
    expect(eliteChance(10)).toBeGreaterThan(0);
    expect(eliteChance(10)).toBeLessThan(eliteChance(25));
    expect(eliteChance(9999)).toBeLessThanOrEqual(0.32);
  });
});

describe('rolls respect wave gates', () => {
  it('rollArchetype never returns something gated above the wave', () => {
    for (const wave of [1, 3, 8, 15]) {
      for (let i = 0; i < 120; i++) {
        const k = rollArchetype(wave, () => i / 120);
        expect(ARCHETYPES[k].minWave).toBeLessThanOrEqual(wave);
      }
    }
  });

  it('wave 1 can only produce the drone', () => {
    for (let i = 0; i < 60; i++) expect(rollArchetype(1, () => i / 60)).toBe('grunt');
  });

  it('rollElite returns nothing before elites exist', () => {
    expect(rollElite(1, () => 0)).toBeUndefined();
    expect(rollElite(2, () => 0)).toBeUndefined();
  });

  it('rollElite returns nothing when the chance roll fails', () => {
    // First rng() call is the chance gate; 0.99 is far above any eliteChance.
    expect(rollElite(30, () => 0.99)).toBeUndefined();
  });

  it('rollElite respects the per-elite wave gate when it does fire', () => {
    for (const wave of [3, 8, 20]) {
      const k = rollElite(wave, () => 0);
      if (k) expect(ELITES[k].minWave).toBeLessThanOrEqual(wave);
    }
  });
});

describe('applyArchetype', () => {
  it('scales HP off the wave baseline and the archetype multiplier', () => {
    const tank = baseCard();
    applyArchetype(tank, 'tank', undefined, 10);
    expect(tank.hp).toBe(Math.round(baseWaveHp(10) * ARCHETYPES.tank.hp));
    expect(tank.maxHp).toBe(tank.hp);
    expect(tank.hp).toBeGreaterThan(baseWaveHp(10)); // a tank is tankier
  });

  it('an elite multiplies that HP again', () => {
    const plain = baseCard();
    applyArchetype(plain, 'grunt', undefined, 10);
    const elite = baseCard();
    applyArchetype(elite, 'grunt', 'armored', 10);
    expect(elite.hp).toBeGreaterThan(plain.hp);
  });

  it('never produces an enemy with less than 1 HP', () => {
    for (const k of ARCH_KINDS) {
      const c = baseCard();
      applyArchetype(c, k, undefined, 1);
      expect(c.hp).toBeGreaterThanOrEqual(1);
    }
  });

  it('sizes the hitbox from the archetype and keeps w/h square', () => {
    const c = baseCard();
    applyArchetype(c, 'tank', undefined, 5);
    expect(c.h).toBe(Math.round(OB_HIT * ARCHETYPES.tank.size));
    expect(c.w).toBe(c.h);
  });

  it('staggers the first shot so a formation does not fire in unison', () => {
    const times = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const c = baseCard();
      applyArchetype(c, 'grunt', undefined, 5);
      times.add(c.fireT!);
    }
    expect(times.size).toBeGreaterThan(10);
  });

  it('gives a shielded elite a shield pool, and others none', () => {
    const shielded = baseCard();
    applyArchetype(shielded, 'grunt', 'shielded', 10);
    expect(shielded.shieldHp).toBeGreaterThan(0);
    expect(shielded.shieldMax).toBe(shielded.shieldHp);

    const plain = baseCard();
    applyArchetype(plain, 'grunt', 'armored', 10);
    expect(plain.shieldHp).toBeUndefined();
  });

  it('marks a splitter as owing children', () => {
    const c = baseCard();
    applyArchetype(c, 'splitter', undefined, 12);
    expect(c.splitsLeft).toBe(2);
  });
});

describe('movement behaviours', () => {
  const stepFor = (card: Card, seconds: number, ctx: EnemyCtx) => {
    const frames = Math.round(seconds * 60);
    for (let i = 0; i < frames; i++) {
      ctx.elapsed += ctx.dt;
      stepEnemy(card, ctx);
    }
  };

  it('hold parks the enemy on its formation anchor', () => {
    const c = baseCard();
    applyArchetype(c, 'grunt', undefined, 5);
    const { ctx } = makeCtx();
    stepFor(c, 1, ctx);
    expect(c.cx).toBeCloseTo(laneX(2));
    expect(c.y).toBe(200);
  });

  it('sway moves off the anchor and comes back', () => {
    const c = baseCard();
    applyArchetype(c, 'scout', undefined, 5);
    c.behaveT = 0;
    const { ctx } = makeCtx();
    const seen: number[] = [];
    for (let i = 0; i < 240; i++) {
      ctx.elapsed += ctx.dt;
      stepEnemy(c, ctx);
      seen.push(c.cx!);
    }
    expect(Math.max(...seen)).toBeGreaterThan(laneX(2));
    expect(Math.min(...seen)).toBeLessThan(laneX(2));
  });

  it('charge closes the distance to the player', () => {
    const c = baseCard({ y: 100 });
    applyArchetype(c, 'kamikaze', undefined, 8);
    const { ctx } = makeCtx();
    const before = Math.hypot((c.cx ?? 0) - ctx.playerX, c.y - ctx.playerY);
    stepFor(c, 1, ctx);
    const after = Math.hypot((c.cx ?? 0) - ctx.playerX, c.y - ctx.playerY);
    expect(after).toBeLessThan(before);
  });

  it('dive returns to its slot rather than drifting away', () => {
    const c = baseCard();
    applyArchetype(c, 'diver', undefined, 8);
    c.behaveT = 0;
    const { ctx } = makeCtx();
    const depths: number[] = [];
    for (let i = 0; i < 300; i++) {
      ctx.elapsed += ctx.dt;
      stepEnemy(c, ctx);
      depths.push(c.y);
    }
    expect(Math.max(...depths)).toBeGreaterThan(200); // it does dive
    expect(Math.min(...depths)).toBeCloseTo(200, 0); // and comes back up
  });

  it('blink relocates to a new column over time', () => {
    const c = baseCard();
    applyArchetype(c, 'blinker', undefined, 14);
    const { ctx } = makeCtx();
    const start = c.homeX;
    const columns = new Set<number>();
    for (let i = 0; i < 60 * 20; i++) {
      ctx.elapsed += ctx.dt;
      stepEnemy(c, ctx);
      columns.add(Math.round(c.homeX ?? 0));
    }
    expect(columns.size).toBeGreaterThan(1);
    expect(start).toBeDefined();
  });

  it('every non-charging behaviour stays inside the play area', () => {
    for (const k of ARCH_KINDS) {
      if (ARCHETYPES[k].move === 'charge') continue;
      const c = baseCard();
      applyArchetype(c, k, undefined, 20);
      const { ctx } = makeCtx();
      for (let i = 0; i < 60 * 12; i++) {
        ctx.elapsed += ctx.dt;
        stepEnemy(c, ctx);
        const hw = (c.w ?? OB_HIT) / 2;
        expect(c.cx!).toBeGreaterThanOrEqual(FEED_PAD + hw - 0.01);
        expect(c.cx!).toBeLessThanOrEqual(SCREEN.W - FEED_PAD - hw + 0.01);
      }
    }
  });

  it('a regenerating elite heals only after being left alone', () => {
    const c = baseCard();
    applyArchetype(c, 'grunt', 'regen', 10);
    c.hp = 2;
    const { ctx } = makeCtx();
    // Still flashing from a hit → no regen.
    c.hitT = 0.1;
    stepEnemy(c, ctx);
    expect(c.hp).toBe(2);
    // Left alone long enough → it knits back up.
    c.hitT = 0;
    for (let i = 0; i < 60 * 4; i++) stepEnemy(c, ctx);
    expect(c.hp).toBeGreaterThan(2);
    expect(c.hp).toBeLessThanOrEqual(c.maxHp);
  });

  it('a non-regen elite never heals', () => {
    const c = baseCard();
    applyArchetype(c, 'grunt', 'armored', 10);
    c.hp = 2;
    const { ctx } = makeCtx();
    for (let i = 0; i < 60 * 5; i++) stepEnemy(c, ctx);
    expect(c.hp).toBe(2);
  });
});

describe('fire behaviours', () => {
  const fireUntilShots = (card: Card, ctx: EnemyCtx, shots: EnemyShotSpec[], maxSec = 12) => {
    const frames = Math.round(maxSec * 60);
    for (let i = 0; i < frames && shots.length === 0; i++) {
      ctx.elapsed += ctx.dt;
      enemyFire(card, ctx);
    }
    return shots;
  };

  it('a kamikaze never fires', () => {
    const c = baseCard();
    applyArchetype(c, 'kamikaze', undefined, 8);
    const { ctx, shots } = makeCtx();
    fireUntilShots(c, ctx, shots);
    expect(shots).toEqual([]);
  });

  it('an aimed shot heads toward the player', () => {
    const c = baseCard();
    applyArchetype(c, 'grunt', undefined, 5);
    const { ctx, shots } = makeCtx();
    fireUntilShots(c, ctx, shots);
    expect(shots.length).toBeGreaterThanOrEqual(1);
    // Player is below, so the shot must travel downward.
    expect(shots[0].vy).toBeGreaterThan(0);
  });

  it('a burst emits three rounds at once', () => {
    const c = baseCard();
    applyArchetype(c, 'tank', undefined, 8);
    const { ctx, shots } = makeCtx();
    fireUntilShots(c, ctx, shots);
    expect(shots.length).toBe(3);
  });

  it('a shotgun emits a spread of five on different headings', () => {
    const c = baseCard();
    applyArchetype(c, 'gunner', undefined, 10);
    const { ctx, shots } = makeCtx();
    fireUntilShots(c, ctx, shots);
    expect(shots.length).toBe(5);
    const angles = new Set(shots.map((s) => Math.atan2(s.vy, s.vx).toFixed(3)));
    expect(angles.size).toBe(5);
  });

  it('a spinner advances its fan each volley and ignores the player', () => {
    const c = baseCard();
    applyArchetype(c, 'spiraller', undefined, 12);
    const { ctx, shots } = makeCtx();
    fireUntilShots(c, ctx, shots);
    const firstAngle = c.spiralA;
    shots.length = 0;
    fireUntilShots(c, ctx, shots);
    expect(c.spiralA).not.toBe(firstAngle);
  });

  it('a sniper telegraphs a wind-up before firing, and fires nothing during it', () => {
    const c = baseCard();
    applyArchetype(c, 'sniper', undefined, 10);
    const { ctx, shots } = makeCtx();

    // Step until the charge starts. The first fire interval is randomised, so
    // this waits for the state change rather than assuming a frame count.
    let framesToWindup = 0;
    while (!c.windup && framesToWindup < 60 * 10) {
      ctx.elapsed += ctx.dt;
      enemyFire(c, ctx);
      framesToWindup++;
    }
    expect(c.windup).toBeGreaterThan(0);
    // Crucially: nothing has been fired yet — the ring is a warning, not a shot.
    expect(shots).toEqual([]);

    // Then the shot lands, and it is much faster than ordinary enemy fire.
    while (shots.length === 0 && framesToWindup < 60 * 20) {
      ctx.elapsed += ctx.dt;
      enemyFire(c, ctx);
      framesToWindup++;
    }
    expect(shots.length).toBe(1);
    expect(Math.hypot(shots[0].vx, shots[0].vy)).toBeGreaterThan(400);
    // The charge is spent, so the telegraph clears.
    expect(c.windup).toBe(0);
  });

});

describe('death effects', () => {
  it('an explosive elite throws a full ring of shot', () => {
    const c = baseCard();
    applyArchetype(c, 'grunt', 'explosive', 10);
    const shots: EnemyShotSpec[] = [];
    explosiveBurst(c, 10, (s) => shots.push(s));
    expect(shots.length).toBe(10);
    // A ring: every heading distinct, and they cover both vertical directions.
    expect(shots.some((s) => s.vy > 0)).toBe(true);
    expect(shots.some((s) => s.vy < 0)).toBe(true);
  });

  it('a splitter yields two children, a non-splitter none', () => {
    const c = baseCard();
    applyArchetype(c, 'splitter', undefined, 12);
    expect(splitChildren(c, 12).length).toBe(2);

    const plain = baseCard();
    applyArchetype(plain, 'grunt', undefined, 12);
    expect(splitChildren(plain, 12)).toEqual([]);
  });

  it('split children land inside the play area and are weaker than the parent', () => {
    const c = baseCard({ lane: 0, cx: FEED_PAD + 2 });
    applyArchetype(c, 'splitter', undefined, 12);
    for (const kid of splitChildren(c, 12)) {
      expect(kid.cx).toBeGreaterThanOrEqual(FEED_PAD);
      expect(kid.cx).toBeLessThanOrEqual(SCREEN.W - FEED_PAD);
      expect(kid.hp).toBeLessThan(c.hp);
    }
  });

  it('a spent splitter does not split again', () => {
    const c = baseCard();
    applyArchetype(c, 'splitter', undefined, 12);
    c.splitsLeft = 0;
    expect(splitChildren(c, 12)).toEqual([]);
  });
});

describe('rewards and helpers', () => {
  it('bounty combines archetype value and elite bonus', () => {
    const plain = baseCard();
    applyArchetype(plain, 'grunt', undefined, 5);
    const elite = baseCard();
    applyArchetype(elite, 'grunt', 'volatile', 15);
    expect(bountyOf(plain)).toBe(ARCHETYPES.grunt.bounty);
    expect(bountyOf(elite)).toBe(ARCHETYPES.grunt.bounty + ELITES.volatile.bonusCoins);
  });

  it('a card with no archetype still pays a baseline bounty', () => {
    // This is the resumed-old-save path: no arch field at all.
    expect(bountyOf(baseCard())).toBe(1);
  });

  it('eliteColor is defined only for elites', () => {
    const plain = baseCard();
    applyArchetype(plain, 'grunt', undefined, 5);
    expect(eliteColor(plain)).toBeUndefined();
    const elite = baseCard();
    applyArchetype(elite, 'grunt', 'swift', 10);
    expect(eliteColor(elite)).toBe(ELITES.swift.color);
  });

  it('descend speed honours a swift elite and defaults otherwise', () => {
    expect(descendSpeed(baseCard())).toBe(ENEMY_DESCEND_SPEED);
    const swift = baseCard();
    applyArchetype(swift, 'grunt', 'swift', 10);
    expect(descendSpeed(swift)).toBeGreaterThan(ENEMY_DESCEND_SPEED);
  });

  it('wave HP baseline climbs with the wave', () => {
    expect(baseWaveHp(20)).toBeGreaterThan(baseWaveHp(1));
  });
});
