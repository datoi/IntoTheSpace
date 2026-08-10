import {
  SCREEN,
  LANES,
  FEED_PAD,
  LANE_W,
  laneX,
  shipForWave,
  SHIP_WAVES,
  ENEMY_SHIPS,
  enemyShotFor,
  ENEMY_SHOT_FOR_ARCH,
  BOSS_SHOT,
  ENEMY_SHOTS,
  ENEMY_SHOT_ASPECT,
  BOSS_MINI_HP,
  BOSS_GIANT_HP,
  BG_SETS,
  AVATARS,
  QUALITY_TIERS,
  BURST_MAX,
  HITSTOP_KILL,
  HITSTOP_ELITE,
  HITSTOP_BOSS_PHASE,
  HITSTOP_BOSS_KILL,
  HITSTOP_MAX,
  SHAKE_AMP,
  SHAKE_REF,
  SHAKE_MAX,
  SHAKE_MAX_PX,
  BOMB_SHAKE,
  MAX_PARTICLES,
  MAX_EXPLOSIONS,
  MAX_ENEMY_BULLETS,
  MAX_FLOATS,
  WAVE_MAX_ENEMIES,
  TALON_COUNT,
  TALON_DMG,
  TALON_SPEED,
  TALON_BURST_TIME,
  TALON_BURST_EVERY,
  SPEAR_COUNT,
  SPEAR_DMG,
  QUALITY_DROP_FRAC,
  QUALITY_RAISE_FRAC,
  FRAME_BUDGET_MS,
  PERF_OVERLAY,
  GUN_LABEL,
  WAVE_COLORS,
  HEARTS_START,
  HEARTS_MAX,
  COIN_EVERY,
  HEART_EVERY,
  AVATAR_Y,
  AVATAR_SIZE,
  SPECIALS,
} from '../constants';
import { ARCH_KINDS } from '../enemies';

describe('laneX', () => {
  it('centers lane 0 half a lane-width in from the left pad', () => {
    expect(laneX(0)).toBeCloseTo(FEED_PAD + LANE_W / 2);
  });

  it('centers the last lane half a lane-width in from the right pad', () => {
    expect(laneX(LANES - 1)).toBeCloseTo(SCREEN.W - FEED_PAD - LANE_W / 2);
  });

  it('spaces adjacent lanes exactly one lane-width apart', () => {
    for (let l = 1; l < LANES; l++) {
      expect(laneX(l) - laneX(l - 1)).toBeCloseTo(LANE_W);
    }
  });

  it('keeps every lane center inside the screen', () => {
    for (let l = 0; l < LANES; l++) {
      expect(laneX(l)).toBeGreaterThan(0);
      expect(laneX(l)).toBeLessThan(SCREEN.W);
    }
  });
});

describe('shipForWave', () => {
  it('uses the first ship for waves 1 through SHIP_WAVES', () => {
    expect(shipForWave(1)).toBe(0);
    expect(shipForWave(SHIP_WAVES)).toBe(0);
  });

  it('advances to the next ship on the wave after each tier boundary', () => {
    expect(shipForWave(SHIP_WAVES + 1)).toBe(1);
    expect(shipForWave(2 * SHIP_WAVES)).toBe(1);
    expect(shipForWave(2 * SHIP_WAVES + 1)).toBe(2);
  });

  it('clamps to the last ship for very deep waves', () => {
    expect(shipForWave(1000)).toBe(ENEMY_SHIPS.length - 1);
  });

  it('never returns an out-of-range index for any wave the game can produce', () => {
    for (let wave = 1; wave <= 200; wave++) {
      const idx = shipForWave(wave);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(ENEMY_SHIPS.length);
    }
  });

  it('stays in range even for invalid input (wave 0 / negative)', () => {
    for (const wave of [0, -1, -10]) {
      const idx = shipForWave(wave);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(ENEMY_SHIPS.length);
    }
  });
});

describe('enemy shot art follows the archetype, not the ship tier', () => {
  it('gives every archetype a shot index in range', () => {
    for (const k of ARCH_KINDS) {
      const idx = ENEMY_SHOT_FOR_ARCH[k];
      expect(Number.isInteger(idx)).toBe(true);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(ENEMY_SHOTS.length);
    }
  });

  it('gives every archetype that actually fires its OWN shot', () => {
    // The point of the change. Kamikaze never fires and the Mine Layer's mines
    // are drawn rather than sprited, so those two alias another entry; every
    // remaining archetype must be distinguishable by its bullet alone.
    const firing = ARCH_KINDS.filter((k) => k !== 'kamikaze' && k !== 'layer');
    const used = firing.map((k) => ENEMY_SHOT_FOR_ARCH[k]);
    expect(new Set(used).size).toBe(used.length);
  });

  it('keeps the boss shot distinct from every archetype', () => {
    expect(BOSS_SHOT).toBeGreaterThanOrEqual(0);
    expect(BOSS_SHOT).toBeLessThan(ENEMY_SHOTS.length);
    for (const k of ARCH_KINDS) expect(ENEMY_SHOT_FOR_ARCH[k]).not.toBe(BOSS_SHOT);
  });

  it('resolves a missing archetype to the plain dot rather than a sprite', () => {
    expect(enemyShotFor(undefined)).toBeUndefined();
    expect(enemyShotFor('sniper')).toBe(ENEMY_SHOT_FOR_ARCH.sniper);
  });

  it('has one aspect ratio per shot sprite', () => {
    expect(ENEMY_SHOT_ASPECT).toHaveLength(ENEMY_SHOTS.length);
    for (const a of ENEMY_SHOT_ASPECT) {
      expect(a).toBeGreaterThan(0);
    }
  });
});

describe('boss HP formulas', () => {
  it('mini boss HP grows linearly with wave', () => {
    expect(BOSS_MINI_HP(5)).toBe(22 + 10);
    expect(BOSS_MINI_HP(15)).toBe(22 + 30);
    expect(BOSS_MINI_HP(15)).toBeGreaterThan(BOSS_MINI_HP(5));
  });

  it('giant boss HP grows linearly with wave and outpaces the mini', () => {
    expect(BOSS_GIANT_HP(10)).toBe(50 + 30);
    for (const w of [10, 20, 50]) {
      expect(BOSS_GIANT_HP(w)).toBeGreaterThan(BOSS_MINI_HP(w));
    }
  });
});

describe('game data integrity', () => {
  it('background sets all have positive-speed, positive-alpha layers', () => {
    expect(BG_SETS.length).toBeGreaterThan(0);
    for (const set of BG_SETS) {
      expect(set.layers.length).toBeGreaterThan(0);
      expect(set.aspect).toBeGreaterThan(0);
      for (const layer of set.layers) {
        expect(layer.speed).toBeGreaterThan(0);
        expect(layer.alpha).toBeGreaterThan(0);
        expect(layer.alpha).toBeLessThanOrEqual(1);
      }
    }
  });

  it('avatars have unique ids and exactly one free starter', () => {
    const ids = AVATARS.map((a) => a.id);
    expect(new Set(ids).size).toBe(AVATARS.length);
    const free = AVATARS.filter((a) => a.price === 0);
    expect(free).toHaveLength(1);
    expect(free[0].id).toBe('ironclad');
  });

  it('avatar prices are non-negative and sorted ascending (shop order)', () => {
    for (let i = 0; i < AVATARS.length; i++) {
      expect(AVATARS[i].price).toBeGreaterThanOrEqual(0);
      if (i > 0) expect(AVATARS[i].price).toBeGreaterThan(AVATARS[i - 1].price);
    }
  });

  it('every gift gun has a HUD label', () => {
    for (const gun of ['double', 'bomb', 'laser', 'homing']) {
      expect(GUN_LABEL[gun]).toBeTruthy();
    }
  });

  it('wave colors is a non-empty list of hex colors', () => {
    expect(WAVE_COLORS.length).toBeGreaterThan(0);
    for (const c of WAVE_COLORS) {
      expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('heart constants are sane', () => {
    expect(HEARTS_START).toBeGreaterThan(0);
    expect(HEARTS_MAX).toBeGreaterThanOrEqual(HEARTS_START);
  });

  it('pickups drop on positive intervals, coins more often than hearts', () => {
    expect(COIN_EVERY).toBeGreaterThan(0);
    expect(HEART_EVERY).toBeGreaterThan(0);
    expect(COIN_EVERY).toBeLessThan(HEART_EVERY); // coins are the common drop
  });

  it('the avatar flies in the lower part of the screen', () => {
    expect(AVATAR_Y).toBeGreaterThan(SCREEN.H / 2);
    expect(AVATAR_Y + AVATAR_SIZE).toBeLessThanOrEqual(SCREEN.H);
  });

  // The array order is the tier order: the shot-colour ramp and the "stronger
  // with price" comments both read off it, so a reorder must not desync it.
  it('ships are listed cheapest-first', () => {
    const prices = AVATARS.map((a) => a.price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it('every ship — including the free starter — names a real special', () => {
    // The starter used to carry 'none', i.e. a permanently dead FIRE button.
    // That taught a new player "you don't have the good stuff" in their first
    // minute instead of teaching them the verb, so Ironclad now has Bulwark.
    for (const a of AVATARS) {
      expect(SPECIALS[a.special]).toBeDefined();
      expect(SPECIALS[a.special].name).toBeTruthy();
    }
  });

  it('no two ships share a special, so each hull sells a different playstyle', () => {
    const specials = AVATARS.map((a) => a.special);
    expect(new Set(specials).size).toBe(specials.length);
  });

});

describe('special ability cost', () => {
  // Raptor and Valkyrie were the two specials that measurably dropped frames on
  // device, because both trade in VOLUME and every projectile is a native view
  // carrying a rotation. They were rebalanced toward fewer, heavier hits. These
  // guard the shape of that trade: the abilities must stay as strong as they
  // were WITHOUT the view counts creeping back up.

  const talonFans = Math.floor(TALON_BURST_TIME / TALON_BURST_EVERY) + 1;
  const talonTotalDamage = talonFans * TALON_COUNT * TALON_DMG;
  // A claw's whole life: fired from the hull, straight up, to the top edge.
  // That is the LONGEST flight available — claws that fan sideways exit through
  // a side sooner — so this over-estimates concurrency, which is the safe
  // direction for a budget. Measured from AVATAR_Y, not SCREEN.H: the ship sits
  // in the lower third, so a claw never crosses the whole board.
  const talonFlightSec = AVATAR_Y / TALON_SPEED;
  const peakTalons = TALON_COUNT * Math.ceil(talonFlightSec / TALON_BURST_EVERY);

  it('keeps the talon barrage hitting at least as hard as it did at 7×2', () => {
    // The pre-rebalance barrage was 17 fans × 7 claws × 2 damage = 238.
    expect(talonTotalDamage).toBeGreaterThanOrEqual(238);
  });

  it('bounds peak live claws — the thing that actually cost frames', () => {
    // On this model the barrage was 49 concurrent claw views at 7 every 0.16s,
    // and is 24 at 4 every 0.2s. The ceiling leaves room to retune without
    // letting it climb back toward what was dropping frames on device.
    // TALON_BURST_EVERY is the dominant lever: lowering it stacks views faster
    // than they clear, and it multiplies against TALON_COUNT.
    expect(peakTalons).toBeLessThanOrEqual(28);
  });

  it('keeps the spear rain exactly as strong against a stacked column', () => {
    // 30 × 8 before, 16 × 15 now. Spears pierce, so this is the damage a full
    // column takes and it must not regress — the ability's whole identity is
    // deleting a lane.
    expect(SPEAR_COUNT * SPEAR_DMG).toBeGreaterThanOrEqual(240);
  });

  it('bounds the spear rain, which is ALL concurrent by construction', () => {
    // Unlike claws, a spear falls the whole board, so the rain never partially
    // clears — SPEAR_COUNT is the peak, not the total.
    expect(SPEAR_COUNT).toBeLessThanOrEqual(20);
  });

  it('still fields a spear for every lane, so coverage never depends on luck', () => {
    // Column-aimed spears are allocated before the random scatter, so as long
    // as there are more spears than lanes the targeted part is intact.
    expect(SPEAR_COUNT).toBeGreaterThan(LANES);
  });

  it('still reads as a fan and a rain rather than a pair of shots', () => {
    expect(TALON_COUNT).toBeGreaterThanOrEqual(3);
    expect(SPEAR_COUNT).toBeGreaterThanOrEqual(10);
  });
});

describe('float ceiling', () => {
  it('is small enough to bound a screen-clearing special', () => {
    // A Nova can resolve a full formation on one frame, paying a <Text> per
    // kill — the priciest view the renderer makes. The cap has to be under a
    // formation, or it does not bind on the case it exists for.
    expect(MAX_FLOATS).toBeLessThan(WAVE_MAX_ENEMIES);
  });

  it('is large enough that ordinary play never loses a readout', () => {
    expect(MAX_FLOATS).toBeGreaterThanOrEqual(8);
  });
});

describe('enemy shot ceiling', () => {
  it('leaves room for a full formation to fire without ever engaging', () => {
    // The ceiling is a bound on the pathological tail, NOT a balance lever. If
    // it sits near what ordinary play produces it stops being a safety valve
    // and starts silently cancelling attacks the difficulty curve intended.
    // A full formation each holding a few shots in flight is ordinary; the cap
    // must be comfortably above it.
    expect(MAX_ENEMY_BULLETS).toBeGreaterThan(WAVE_MAX_ENEMIES * 4);
  });

  it('stays small enough to actually bound the frame', () => {
    // Every live shot is a native view written every frame. A ceiling this is
    // allowed to grow past would defeat its own purpose.
    expect(MAX_ENEMY_BULLETS).toBeLessThanOrEqual(96);
  });

  it('is NOT tier-scaled — every device plays the same game', () => {
    // The tiers promise they only change how lavishly events are DRAWN. An
    // enemy shot is something the player acts on, so scaling it per device
    // would make the game easier on a slow phone. Guard the promise.
    for (const tier of QUALITY_TIERS) {
      expect(tier).not.toHaveProperty('enemyBullets');
    }
  });
});

describe('adaptive quality tiers', () => {
  it('starts at full detail — every phone gets the real game first', () => {
    expect(QUALITY_TIERS[0]).toEqual({
      particles: MAX_PARTICLES,
      explosions: MAX_EXPLOSIONS,
      burst: 1,
      bgLayers: 3,
      planets: true,
    });
  });

  it('draws every layer of the richest sky at full detail', () => {
    // Tier 0 must not silently trim a background just because a new set was
    // authored with more layers than the tier table knew about.
    const deepest = Math.max(...BG_SETS.map((s) => s.layers.length));
    expect(QUALITY_TIERS[0].bgLayers).toBeGreaterThanOrEqual(deepest);
  });

  it('every step down actually draws less', () => {
    // A tier that isn't strictly cheaper than the one above buys nothing and
    // makes the governor's climb-back hysteresis meaningless.
    for (let i = 1; i < QUALITY_TIERS.length; i++) {
      const prev = QUALITY_TIERS[i - 1];
      const cur = QUALITY_TIERS[i];
      expect(cur.particles).toBeLessThan(prev.particles);
      expect(cur.explosions).toBeLessThan(prev.explosions);
      expect(cur.burst).toBeLessThan(prev.burst);
      // The sky is the sustained cost, so it may only ever get cheaper too —
      // though it steps rather than falling at every tier.
      expect(cur.bgLayers).toBeLessThanOrEqual(prev.bgLayers);
      expect(Number(cur.planets)).toBeLessThanOrEqual(Number(prev.planets));
    }
  });

  it('never trims the sky away entirely', () => {
    // A background is not optional — losing the last layer leaves bare void,
    // which reads as the game failing to load rather than running lean.
    for (const t of QUALITY_TIERS) expect(t.bgLayers).toBeGreaterThanOrEqual(1);
  });

  it('the lowest tier still shows an effect at all', () => {
    // Degrading to nothing would read as the game being broken rather than as
    // it running lean — a kill has to stay legible on the weakest device.
    const floor = QUALITY_TIERS[QUALITY_TIERS.length - 1];
    expect(floor.particles).toBeGreaterThan(0);
    expect(floor.explosions).toBeGreaterThan(0);
    expect(floor.burst).toBeGreaterThan(0);
  });

  it('leaves a gap between dropping a tier and climbing back', () => {
    // Without it a device sitting on the threshold oscillates, and effects
    // popping in and out is worse than simply having fewer of them.
    expect(QUALITY_RAISE_FRAC).toBeLessThan(QUALITY_DROP_FRAC);
  });

  it('budgets a frame above 60Hz but below half rate', () => {
    // Above 16.7ms so ordinary jitter doesn't register as a dropped frame;
    // below 33.3ms so the governor reacts before the game is visibly halved.
    expect(FRAME_BUDGET_MS).toBeGreaterThan(1000 / 60);
    expect(FRAME_BUDGET_MS).toBeLessThan(1000 / 30);
  });

  it('ships with the profiler off unless a build explicitly turns it on', () => {
    // Opt-IN, never opt-out: the overlay is enabled only by the `perf` EAS
    // profile setting EXPO_PUBLIC_PERF_OVERLAY. Nothing else may switch it on,
    // so a normal build cannot accidentally ship a debug readout over the game.
    expect(process.env.EXPO_PUBLIC_PERF_OVERLAY).toBeUndefined();
    expect(PERF_OVERLAY).toBe(false);
  });

  it('caps a single burst below the whole field', () => {
    // Neither the board-load scale nor the frame-time governor can stop one
    // event filling the pool in one frame — the governor decides over 45 frames
    // and a burst is gone in 40. This cap is the only instant one.
    expect(BURST_MAX).toBeGreaterThan(0);
    expect(BURST_MAX).toBeLessThan(MAX_PARTICLES);
  });
});

describe('hit-stop', () => {
  it('freezes strictly longer for bigger events', () => {
    // The ordering is what makes a freeze read as "that was a bigger deal"
    // rather than as inconsistent performance. Equal values would flatten it.
    expect(HITSTOP_KILL).toBeLessThan(HITSTOP_ELITE);
    expect(HITSTOP_ELITE).toBeLessThan(HITSTOP_BOSS_PHASE);
    expect(HITSTOP_BOSS_PHASE).toBeLessThan(HITSTOP_BOSS_KILL);
  });

  it('bounds every freeze by the ceiling the loop clamps to', () => {
    for (const v of [HITSTOP_KILL, HITSTOP_ELITE, HITSTOP_BOSS_PHASE, HITSTOP_BOSS_KILL]) {
      expect(v).toBeLessThanOrEqual(HITSTOP_MAX);
    }
  });

  it('keeps the longest freeze under six frames at 60Hz', () => {
    // Past roughly this point a deliberate freeze stops reading as impact and
    // starts reading as a dropped frame — which is what was reported.
    expect(HITSTOP_MAX).toBeLessThanOrEqual(6 / 60);
  });
});

describe('camera shake', () => {
  it('either covers the hardest hit in the game, or is off entirely', () => {
    // SHAKE_MAX_PX is what the sky and the scrim are inflated by. A partial
    // margin is the one useless setting: it costs the geometry complexity of
    // inflating everything and still lets a strip show at peak shake. So it is
    // either enough for the hardest hit, or 0 — which restores exactly the
    // uninflated geometry rather than an in-between.
    const peakTravel = (SHAKE_AMP / 2) * (SHAKE_MAX / SHAKE_REF);
    expect(SHAKE_MAX_PX === 0 || SHAKE_MAX_PX >= peakTravel).toBe(true);
  });

  it('quotes every hit against an intensity the game actually uses', () => {
    expect(SHAKE_REF).toBeGreaterThan(0);
    expect(SHAKE_MAX).toBeGreaterThanOrEqual(BOMB_SHAKE);
  });
});
