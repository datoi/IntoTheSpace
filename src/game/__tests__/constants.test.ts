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
  MAX_PARTICLES,
  MAX_EXPLOSIONS,
  MAX_ENEMY_BULLETS,
  PLANET_SPEED,
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
  AVATAR_HULL_CY,
  AVATAR_HULL_D,
  AVATAR_HIT_W,
  AVATAR_HIT_H,
  GIFT_ICON,
  GIFT_SHOT_LEN,
  GIFT_DOUBLE_GAP,
  GUN_DROP_VIS,
  ENEMY_BULLET_SIZE,
  ENEMY_BULLET_ART_SCALE,
  SHIELD_RING,
  SHIELD_ARC_W,
  BULWARK_ARC_W,
  BULWARK_MID_ALPHA,
  BULWARK_RIM_ALPHA,
  BULWARK_SPIN_MS,
  SHELL_MID_ALPHA,
  SHELL_RIM_ALPHA,
  SHELL_SPIN_MS,
  SHELL_CLEAR_R,
  SHIELD_HITS,
  BULWARK_RING,
  SPECIALS,
  SPECIAL_GLYPH_SCRIM,
  PALETTE,
} from '../constants';
import { ARCH_KINDS } from '../enemies';
import { contrast } from '../theme';
import type { SpecialKind } from '../types';

describe('the hull, and what gets drawn around it', () => {
  it('does not confuse the drawn hull with the hitbox', () => {
    // These are ~15px apart: the hitbox is small and sits low, the sprite is
    // larger and lifted. Anything centred on the hitbox renders behind the
    // ship, which is exactly what the shield hoop did.
    expect(AVATAR_HULL_CY).not.toBeCloseTo(AVATAR_SIZE / 2, 1);
    // The hull is drawn ABOVE the hitbox centre, never below it.
    expect(AVATAR_HULL_CY).toBeLessThan(AVATAR_SIZE / 2);
  });

  it('keeps the shield hoop wider than the hull it encloses', () => {
    // It was 78 against an ~81px hull — narrower than the ship, so the wingtips
    // sat outside the bubble even once the centring was right.
    expect(SHIELD_RING).toBeGreaterThan(AVATAR_HULL_D);
  });

  it('leaves the rim ramp somewhere to live', () => {
    // Clearing the hull is necessary but not sufficient. The shell reads as a
    // VOLUME because opacity ramps across the band between the hull and the
    // rim; at 92 that band was 5.4px a side and the stroke ate most of it, so
    // there was nowhere for a ramp to happen and it read as a collar. Both
    // shells have to keep real room there, or the gradient collapses back into
    // the outline this redesign replaced.
    const clearance = (SHIELD_RING - AVATAR_HULL_D) / 2;
    expect(clearance).toBeGreaterThanOrEqual(9);
    expect((BULWARK_RING - AVATAR_HULL_D) / 2).toBeGreaterThanOrEqual(9);
  });

  it('keeps Bulwark reading as the heavier of the two shells', () => {
    expect(BULWARK_RING).toBeGreaterThan(SHIELD_RING);
    // …and not by four pixels. These shipped as 92 vs 96 with a 1px difference
    // in stroke at an identical hue, which is not a hierarchy — it is two names
    // for the same drawing. Every parameter the shared primitive takes has to
    // point the same way.
    expect(BULWARK_ARC_W).toBeGreaterThan(SHIELD_ARC_W);
    expect(BULWARK_MID_ALPHA).toBeGreaterThan(SHELL_MID_ALPHA);
    expect(BULWARK_RIM_ALPHA).toBeGreaterThan(SHELL_RIM_ALPHA);
    // Lower is faster: BULWARK's ring turns in less time.
    expect(BULWARK_SPIN_MS).toBeLessThan(SHELL_SPIN_MS);
  });

  it('keeps the shell transparent where the hull is drawn', () => {
    // A legibility rule, not an aesthetic one. The gradient is clear out to
    // SHELL_CLEAR_R of the radius; the hull occupies AVATAR_HULL_D. If the ramp
    // started inside the hull it would tint the ship — and anything that makes
    // the player's own position harder to read is wrong however good it looks.
    const hullFracOfRadius = AVATAR_HULL_D / SHIELD_RING;
    expect(SHELL_CLEAR_R).toBeGreaterThanOrEqual(hullFracOfRadius * 0.9);
  });

  it('keeps the hurtbox the size it always was, only better placed', () => {
    // Recentring it must not quietly retune difficulty: same 44×44 area as the
    // box it replaced, so the only thing that changed is where it sits.
    expect(AVATAR_HIT_W).toBe(44);
    expect(AVATAR_HIT_H).toBe(44);
  });

  it('keeps the hurtbox well inside the drawn hull', () => {
    // Genre convention, and what makes dense patterns survivable: the ship you
    // see is the fantasy, the box that can be hit is a fraction of it.
    expect(AVATAR_HIT_W).toBeLessThan(AVATAR_HULL_D);
    expect(AVATAR_HIT_H).toBeLessThan(AVATAR_HULL_D);
  });

  it('gives the shield a finite, whole-numbered budget', () => {
    // The whole point: a shield that absorbs everything for its full duration
    // means the correct play is to stop dodging, which deletes the game.
    expect(Number.isInteger(SHIELD_HITS)).toBe(true);
    expect(SHIELD_HITS).toBeGreaterThanOrEqual(1);
  });
});

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
    // The point of the change. Kamikaze never fires, so it aliases another
    // entry; every remaining archetype must be distinguishable by its bullet
    // alone.
    const firing = ARCH_KINDS.filter((k) => k !== 'kamikaze');
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
    expect(BOSS_MINI_HP(5)).toBe(90 + 80);
    expect(BOSS_MINI_HP(15)).toBe(90 + 240);
    expect(BOSS_MINI_HP(15)).toBeGreaterThan(BOSS_MINI_HP(5));
  });

  it('giant boss HP grows linearly with wave and outpaces the mini', () => {
    expect(BOSS_GIANT_HP(10)).toBe(150 + 200);
    for (const w of [10, 20, 50]) {
      expect(BOSS_GIANT_HP(w)).toBeGreaterThan(BOSS_MINI_HP(w));
    }
  });

  // The giant used to be 220 + 34w, which at the damage an upgraded ship
  // actually deals ran 1.5-3 minutes of the SAME five phases - long past the
  // point where each one has shown what it asks for. Length is bounded here
  // rather than in a comment so re-inflating the curve fails loudly.
  it('a giant dies inside an arcade-length fight for an upgraded ship', () => {
    // ~4x the zero-upgrade floor of 3 dmg/s: a player who has spent coins on
    // damage and fire rate and is running a double gun.
    const UPGRADED_DPS = 12;
    // Giants hold every 10th wave.
    for (const w of [10, 20, 30]) {
      const seconds = BOSS_GIANT_HP(w) / UPGRADED_DPS;
      expect(seconds).toBeGreaterThan(20); // still an ordeal, not a speed bump
      expect(seconds).toBeLessThan(70); // ...but never a war of attrition
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

/**
 * The FIRE button is per-ship now, and the table behind it is exactly the kind
 * of thing that rots when a sixth hull lands. Record<SpecialKind, SpecialDef>
 * makes a MISSING entry a compile error; these cover what the type cannot —
 * that the entries are distinct, honest about the colour the ability arrives
 * in, and still readable once they are sitting on the button.
 */
describe('the special identity table', () => {
  const KINDS = Object.keys(SPECIALS) as SpecialKind[];
  // The same floors theme.test.ts uses, read off the same helper, so this
  // cannot drift from the contrast rule the rest of the app is held to.
  const AA = 4.5;
  const AA_LARGE = 3;

  /** Flatten an rgba() layer onto an opaque hex, the way the screen does. */
  const composite = (over: string, under: string): string => {
    const m = over.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/);
    if (!m) throw new Error(`not an rgba value: ${over}`);
    const [r, g, b, a] = m.slice(1).map(Number);
    const u = [1, 3, 5].map((i) => parseInt(under.slice(i, i + 2), 16));
    const mix = [r, g, b].map((c, i) => Math.round(c * a + u[i] * (1 - a)));
    return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  };

  it('gives every ultimate its own glyph', () => {
    // Two abilities wearing one mark is worse than no mark: the button would
    // change between hulls while telling the player nothing true.
    const icons = KINDS.map((k) => SPECIALS[k].icon);
    expect(icons).toHaveLength(KINDS.length);
    expect(new Set(icons).size).toBe(icons.length);
    // Namespaced, so an ultimate can never quietly borrow a boon's glyph —
    // 'shield' is a pickup, 'sp-bulwark' is an ability.
    for (const icon of icons) expect(icon).toMatch(/^sp-/);
  });

  it('gives every ultimate its own accent', () => {
    const accents = KINDS.map((k) => SPECIALS[k].accent);
    expect(new Set(accents).size).toBe(accents.length);
    for (const a of accents) expect(a).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('wears the same colour as the hull that carries it', () => {
    // The accent drives the armed rim and the full meter; the hull's shot tint
    // is what its bolts — and, for talons and spears, the ability itself — are
    // actually drawn in. The two being ONE value is the whole guarantee that
    // the button cannot promise a colour the ability does not deliver. They
    // were independent literals before the table existed.
    for (const a of AVATARS) {
      expect(a.shot.tint).toBe(SPECIALS[a.special].accent);
    }
  });

  it('keeps every accent legible as a rim against the sky behind it', () => {
    // The armed rim is a UI boundary drawn over the playfield, so it is held to
    // AA_LARGE — the same floor theme.test.ts applies to `threat` over a panel.
    // A pastel accent would arm the button invisibly.
    for (const k of KINDS) {
      expect(contrast(SPECIALS[k].accent, PALETTE.void)).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('keeps the glyph readable once the meter has filled behind it', () => {
    // The failure this exists for: the fill now ENDS on the accent, and white
    // ink on Nova's gold is about 1.5:1. The dark disc under the glyph is what
    // buys that back — so the contrast that matters is ink against the scrim
    // COMPOSITED OVER the accent, not against the accent alone. Anyone who
    // removes the disc or picks a pale accent fails here.
    for (const k of KINDS) {
      const behind = composite(SPECIAL_GLYPH_SCRIM, SPECIALS[k].accent);
      expect(contrast(PALETTE.ink, behind)).toBeGreaterThanOrEqual(AA);
    }
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
    // Shake is a DAMAGE-ONLY channel now, and the hardest hit in the game is
    // losing a heart (`takeHit`, 0.28) — which is exactly the reference the
    // amplitude is quoted at. If a future change makes something shake harder
    // than the reference, the ceiling has to move with it or the clamp starts
    // silently eating intensity.
    expect(SHAKE_MAX).toBe(SHAKE_REF);
  });
});

describe('planets read as being IN space', () => {
  // Planets used to draw in FRONT of every layer at 46% of screen width and
  // full opacity, which reads as a sticker on the lens however it is tuned.
  // The fix is occlusion: a transparent star veil in front of them, moving
  // much faster. These pin the three things that make that work — anything in
  // front, enough speed difference to notice, and planets small and dim enough
  // to sit in the field rather than on it.

  it('gives every sky something transparent IN FRONT of its planets', () => {
    // ParallaxBackground draws the planet field between the last two layers,
    // so a set with only ONE layer puts its planets in front of everything.
    // That single fact is what made them look pasted on.
    for (const set of BG_SETS) {
      if (!set.planet) continue;
      expect(set.layers.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('makes the front layer visibly overtake the planets', () => {
    // Occlusion alone is not depth: something crossing at the SAME speed just
    // covers the planet. The gap is the cue.
    for (const set of BG_SETS) {
      if (!set.planet) continue;
      const front = set.layers[set.layers.length - 1];
      expect(front.speed).toBeGreaterThan(PLANET_SPEED * 4);
    }
  });

  it('puts a star field on BOTH sides of the planets', () => {
    // The planet has to sit INSIDE the starfield, not on one side of it: stars
    // drifting behind as well as across is what stops the front field reading
    // as a scrim laid over the picture.
    for (const set of BG_SETS) {
      if (!set.planet) continue;
      // ParallaxBackground draws the field one layer from the front, so
      // everything before that index is behind the planets.
      expect(set.layers.length).toBeGreaterThanOrEqual(3);
      const behind = set.layers.slice(0, -1);
      expect(behind.some((L) => L.speed > PLANET_SPEED)).toBe(true);
    }
  });

  it('keeps the star fields SLOW, near the sky they sit in', () => {
    // The first attempt ran one field at 0.45 against a 0.15 nebula and the
    // whole starfield swept past like a scrim. Stars are the most distant
    // things in frame; nothing may outrun the backdrop by much.
    for (const set of BG_SETS) {
      if (!set.planet) continue;
      const backdrop = set.layers[0].speed;
      for (const L of set.layers.slice(1)) {
        expect(L.speed).toBeLessThan(backdrop * 2.5);
      }
    }
  });

  it('separates the two star fields, so they are not one plane', () => {
    // Two fields at the same rate is one field with extra cost.
    for (const set of BG_SETS) {
      if (!set.planet) continue;
      const [far, near] = set.layers.slice(-2);
      expect(near.speed).toBeGreaterThan(far.speed * 1.3);
    }
  });

  it('keeps the front layer cheap — per-pixel alpha, not group opacity', () => {
    // Group opacity below 1 asks the platform for an offscreen compositing
    // buffer the size of the layer, every frame, for the whole run.
    for (const set of BG_SETS) {
      if (!set.planet) continue;
      expect(set.layers[set.layers.length - 1].alpha).toBe(1);
    }
  });

  it('keeps planets small and hazed by distance', () => {
    for (const set of BG_SETS) {
      for (const p of set.planet?.items ?? []) {
        expect(p.sizeFrac).toBeLessThanOrEqual(0.25);
        expect(p.sizeFrac).toBeGreaterThan(0.05);
        expect(p.opacity).toBeLessThan(0.6);
      }
    }
  });

  it('never draws planets on a tier that has trimmed the veil away', () => {
    // The quality governor trims layers from the front of the stack, so a low
    // tier can drop the veil — and without it the planets would be frontmost
    // again, i.e. the exact bug, only on the weakest devices. Planets must be
    // off by then.
    const deepest = Math.max(...BG_SETS.map((s) => s.layers.length));
    for (const tier of QUALITY_TIERS) {
      const drawn = Math.max(1, Math.min(deepest, tier.bgLayers));
      if (drawn < deepest) expect(tier.planets).toBe(false);
    }
  });
});

/**
 * A gun drop must not read as enemy fire.
 *
 * These are the same KIND of object — both are projectile art on a dark sky —
 * so size is most of what separates them, and the numbers live in two blocks
 * hundreds of lines apart that know nothing about each other. At GIFT_ICON 48
 * a drop was 1.4x an enemy bullet, which is not a call you can make at falling
 * speed with a wave on screen.
 */
describe('a gun drop reads apart from an enemy shot', () => {
  /** What an enemy bullet actually covers on screen. */
  const enemyShot = ENEMY_BULLET_SIZE * ENEMY_BULLET_ART_SCALE;

  it('is clearly larger than an enemy bullet', () => {
    expect(GIFT_ICON).toBeGreaterThanOrEqual(enemyShot * 1.8);
  });

  it('is larger than a boss shot too', () => {
    // Boss fans are the densest fire in the game and the worst place to mistake
    // a reward for a projectile.
    expect(GIFT_ICON).toBeGreaterThan(BOSS_SHOT * ENEMY_BULLET_ART_SCALE);
  });

  it('carries a halo wider than the art inside it', () => {
    // The second half of the fix, and the half the laser drop depends on: its
    // thickness is bound by its source aspect, so the glow is what makes it
    // unmistakable. If the art ever outgrew the halo the sprite would poke out
    // of its own light, which is the "pasted on" read the halo exists to stop.
    expect(GUN_DROP_VIS).toBeGreaterThan(GIFT_ICON);
    // An enemy bullet has no glow at all, so the pool of light is itself a tell.
    expect(GUN_DROP_VIS).toBeGreaterThan(enemyShot * 2);
  });

  it('keeps the two bolts of a double drop inside their own box', () => {
    // They are positioned from the footprint's centre, so a gap wide enough to
    // push one off the edge would clip it against nothing.
    expect(GIFT_DOUBLE_GAP * 2).toBeLessThan(GUN_DROP_VIS);
    expect(GIFT_SHOT_LEN).toBeLessThanOrEqual(GUN_DROP_VIS);
  });
});
