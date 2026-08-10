/**
 * The friend/foe rule, enforced as a test.
 *
 * The rule is only worth having if it can't quietly rot: the previous palette
 * named colours after whichever feature first used them, so `rage` ended up
 * being damage feedback, the title accent AND a helpful pickup simultaneously,
 * and nothing caught it. These tests make the invariants mechanical.
 *
 *   plasma = the player      — never on an enemy, a hazard, or a price
 *   threat = hostile         — never on a pickup, a reward, or the chain
 *   gold   = reward
 */
import {
  PALETTE,
  WAVE_COLORS,
  CHAIN_HUD_COLOR,
  CHAIN_HUD_HOT,
  SHIELD_COLOR,
  GRAZE_COLOR,
  CRIT_COLOR,
  BULWARK_COLOR,
  COIN_GOLD,
  ENEMY_SHOTS,
  ENEMY_SHOT_ASPECT,
  ENEMY_SHIPS,
  AVATARS,
} from '../constants';
import { BOONS, BOON_KINDS } from '../pickups';
import { ARCHETYPES, ARCH_KINDS, ELITES, ELITE_KINDS, applyArchetype } from '../enemies';

/** Every hostile value in the palette. */
const HOSTILE = [PALETTE.threat, PALETTE.threatDeep, PALETTE.threatAlt];
/** Every player-side value. */
const FRIENDLY = [PALETTE.plasma, PALETTE.plasmaDeep];
const REWARD = [PALETTE.gold, PALETTE.goldHi];

describe('the token block', () => {
  it('has no leftover feature-named keys', () => {
    // These are what the split was for. Their absence is the migration's
    // acceptance criterion.
    for (const dead of ['rage', 'moment', 'bell', 'ad', 'rageDim', 'momentDim', 'adDim', 'bg', 'card']) {
      expect(dead in PALETTE).toBe(false);
    }
  });

  it('every token is a usable colour value', () => {
    for (const [name, value] of Object.entries(PALETTE)) {
      expect(typeof value).toBe('string');
      expect(value).toMatch(/^(#[0-9A-Fa-f]{6}|rgba?\([\d.,\s]+\))$/);
      expect(name).not.toMatch(/^\s*$/);
    }
  });

  it('keeps the hostile, friendly and reward families disjoint', () => {
    // If any two families shared a value the rule would be unenforceable.
    const all = [...HOSTILE, ...FRIENDLY, ...REWARD];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('enemy fire is never friendly-coloured', () => {
  it('WAVE_COLORS is a single hostile hue', () => {
    // It used to cycle eight, which meant the thing that ends the run wore
    // friendly green on wave 4 and the player's own cyan on wave 8.
    expect(WAVE_COLORS.length).toBe(1);
    expect(HOSTILE).toContain(WAVE_COLORS[0]);
  });

  it('and still satisfies the shape every caller relies on', () => {
    expect(WAVE_COLORS.length).toBeGreaterThan(0);
    for (const c of WAVE_COLORS) expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('no wave colour is a player or reward hue', () => {
    for (const c of WAVE_COLORS) {
      expect(FRIENDLY).not.toContain(c);
      expect(REWARD).not.toContain(c);
    }
  });
});

describe('elite auras stay hostile', () => {
  it('every aura is in the threat family', () => {
    for (const k of ELITE_KINDS) {
      expect(HOSTILE).toContain(ELITES[k].color);
    }
  });

  it("none of them is the player's own shield colour", () => {
    // 'shielded' was literally SHIELD_COLOR — the player's own bubble hue on an
    // enemy, which is the single most confusing thing the old palette did.
    for (const k of ELITE_KINDS) {
      expect(ELITES[k].color).not.toBe(SHIELD_COLOR);
      expect(FRIENDLY).not.toContain(ELITES[k].color);
      expect(REWARD).not.toContain(ELITES[k].color);
    }
  });
});

describe('pickups are never hostile-coloured', () => {
  it('no boon wears a threat hue', () => {
    // Damage Boost used to be painted in the danger colour and Extra Heart in
    // hostile magenta — both *helpful* drops advertising themselves as lethal.
    for (const k of BOON_KINDS) {
      expect(HOSTILE).not.toContain(BOONS[k].color);
    }
  });

  it('every boon colour is one of the six families', () => {
    // Health and charge were split out of the defensive family: red reads as
    // "health" without being taught, and the special meter is neither armour
    // nor healing.
    const families = [
      PALETTE.plasma,
      PALETTE.vital,
      PALETTE.amber,
      PALETTE.violet,
      PALETTE.gold,
      PALETTE.energy,
    ];
    for (const k of BOON_KINDS) {
      expect(families).toContain(BOONS[k].color);
    }
  });

  it('keeps health red distinct from the hostile crimson it sits next to', () => {
    // The whole risk of putting red on a pickup. If these ever collapse to one
    // value, a heal and the thing that ends the run wear the same colour.
    expect(PALETTE.vital).not.toBe(PALETTE.threat);
    expect(HOSTILE).not.toContain(PALETTE.vital);
  });

  it('groups defensive, health, offensive, control and economy boons consistently', () => {
    expect(BOONS.repair.color).toBe(BOONS.extraHeart.color);
    expect(BOONS.damageBoost.color).toBe(BOONS.fireBoost.color);
    expect(BOONS.freeze.color).toBe(BOONS.slowmo.color);
    expect(BOONS.magnet.color).toBe(BOONS.doubleCoins.color);
    // …and the families are actually different from one another.
    expect(BOONS.shield.color).not.toBe(BOONS.repair.color);
    expect(BOONS.shield.color).not.toBe(BOONS.damageBoost.color);
    expect(BOONS.freeze.color).not.toBe(BOONS.magnet.color);
    expect(BOONS.energy.color).not.toBe(BOONS.shield.color);
  });
});

describe('player-side signals stay on the player hue', () => {
  it('shield, graze and bulwark are all plasma', () => {
    expect(SHIELD_COLOR).toBe(PALETTE.plasma);
    expect(GRAZE_COLOR).toBe(PALETTE.plasma);
    expect(BULWARK_COLOR).toBe(PALETTE.plasma);
  });
});

describe('the chain is a reward, not a threat', () => {
  it('never lights up in a hostile hue', () => {
    // CHAIN_HUD_HOT shipped as #FF6BD6 — so the moment the player was doing
    // BEST, the HUD lit up in the colour of danger.
    for (const c of [CHAIN_HUD_COLOR, CHAIN_HUD_HOT]) {
      expect(HOSTILE).not.toContain(c);
      expect(c).not.toBe('#FF6BD6');
    }
  });

  it('escalates within the reward family rather than changing hue', () => {
    expect(CHAIN_HUD_COLOR).toBe(PALETTE.gold);
    // Hot is a brighter gold, not a different colour.
    expect(CHAIN_HUD_HOT).toMatch(/^#FF[0-9A-Fa-f]{4}$/);
  });

  it('crits and coins are reward-coloured', () => {
    expect(REWARD).toContain(CRIT_COLOR);
    expect(REWARD).toContain(COIN_GOLD);
  });
});

describe('projectile art carries allegiance, not tint', () => {
  it('every enemy shot has a real aspect — none is a square placeholder', () => {
    // These were 64×64 missile canvases drawn 1:1 and flat-tinted crimson,
    // which threw away the sprite's own shading. They are real crimson art now.
    expect(ENEMY_SHOT_ASPECT.length).toBe(ENEMY_SHOTS.length);
    for (const a of ENEMY_SHOT_ASPECT) {
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThan(1); // all five are taller than they are wide
    }
  });

  it('enemy shots differ by silhouette, since they can no longer differ by hue', () => {
    // One hostile colour means proportion is the only channel left for variety.
    expect(new Set(ENEMY_SHOT_ASPECT).size).toBe(ENEMY_SHOT_ASPECT.length);
  });

  it('every hull bolt is on the cool half of the wheel, or gold', () => {
    // The point of the recolour: no player projectile may read as enemy fire.
    for (const a of AVATARS) {
      expect(HOSTILE).not.toContain(a.shot.tint);
      expect(a.shot.tint).not.toBe('#FF4757'); // the old Raptor red
      expect(a.shot.aspect).toBeGreaterThan(0);
    }
  });

  it('gives every hull its own identity colour', () => {
    const tints = AVATARS.map((a) => a.shot.tint);
    expect(new Set(tints).size).toBe(tints.length);
  });
});

describe('enemy art follows behaviour', () => {
  it('every archetype names a real sprite', () => {
    for (const k of ARCH_KINDS) {
      const i = ARCHETYPES[k].sprite;
      expect(Number.isInteger(i)).toBe(true);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(ENEMY_SHIPS.length);
    }
  });

  it('uses most of the cast rather than cycling a handful', () => {
    // Fifteen archetypes used to share six sprites chosen by WAVE, so two
    // completely different threats looked identical and the same enemy changed
    // appearance every five waves.
    const used = new Set(ARCH_KINDS.map((k) => ARCHETYPES[k].sprite));
    expect(used.size).toBeGreaterThanOrEqual(10);
  });

  it('stamps the archetype sprite onto the card, overriding the wave default', () => {
    const card: any = { shipIdx: 99, hitT: 0 };
    applyArchetype(card, 'sniper', undefined, 30);
    expect(card.shipIdx).toBe(ARCHETYPES.sniper.sprite);
  });

  it('gives a sniper and a kamikaze different silhouettes', () => {
    expect(ARCHETYPES.sniper.sprite).not.toBe(ARCHETYPES.kamikaze.sprite);
  });
});
