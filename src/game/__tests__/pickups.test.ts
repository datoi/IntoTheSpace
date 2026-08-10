/**
 * The utility-pickup catalog and its active-boon bookkeeping. The important
 * promises: a boon's wave gate is respected, timers tick down and clean
 * themselves up, re-collecting refreshes rather than stacks, and every
 * multiplier is exactly 1 (i.e. inert) when nothing is active.
 */
import {
  BOONS,
  BOON_KINDS,
  TIMED_BOONS,
  ActiveBoons,
  COIN_MULT,
  DAMAGE_BOOST_MULT,
  applyTimedBoon,
  boonActive,
  boonRemaining,
  coinValue,
  damageMult,
  enemiesFrozen,
  enemyBulletMult,
  fireIntervalMult,
  isInstant,
  isShielded,
  rollBoon,
  tickBoons,
} from '../pickups';

describe('boon catalog', () => {
  it('every kind has a definition keyed by itself', () => {
    for (const k of BOON_KINDS) expect(BOONS[k].kind).toBe(k);
  });

  it('every boon has a glyph, a colour, a description and a positive weight', () => {
    for (const k of BOON_KINDS) {
      const def = BOONS[k];
      expect(def.icon).toBeTruthy();
      expect(def.color).toMatch(/^#/);
      expect(def.desc.length).toBeGreaterThan(10);
      expect(def.weight).toBeGreaterThan(0);
    }
  });

  it('splits cleanly into timed and instant, with nothing in between', () => {
    for (const k of BOON_KINDS) {
      expect(isInstant(k)).toBe(BOONS[k].duration === 0);
      expect(TIMED_BOONS.includes(k)).toBe(BOONS[k].duration > 0);
    }
    expect(TIMED_BOONS.length).toBeGreaterThan(0);
    expect(TIMED_BOONS.length).toBeLessThan(BOON_KINDS.length);
  });
});

describe('rollBoon', () => {
  it('never returns a boon gated above the current wave', () => {
    // Sweep the whole 0..1 roll space at wave 1 — no gated boon may appear.
    for (let i = 0; i < 200; i++) {
      const k = rollBoon(1, () => i / 200);
      expect(BOONS[k].minWave ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it('opens up gated boons once the wave is deep enough', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(rollBoon(50, () => i / 400));
    // At wave 50 everything is eligible, and a full sweep of the weight space
    // should surface the rarest entry (the nuke) too.
    expect(seen.has('nuke')).toBe(true);
    expect(seen.size).toBeGreaterThan(8);
  });

  it('always returns a real catalog entry', () => {
    for (const wave of [0, 1, 5, 12, 99]) {
      for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
        expect(BOON_KINDS).toContain(rollBoon(wave, () => r));
      }
    }
  });

  it('handles a degenerate roll of exactly 1 without returning undefined', () => {
    expect(BOON_KINDS).toContain(rollBoon(30, () => 1));
  });
});

describe('active boon bookkeeping', () => {
  it('applying a timed boon seeds its full duration', () => {
    const boons: ActiveBoons = {};
    applyTimedBoon(boons, 'shield');
    expect(boonRemaining(boons, 'shield')).toBe(BOONS.shield.duration);
    expect(boonActive(boons, 'shield')).toBe(true);
  });

  it('an instant boon is never stored as a timer', () => {
    const boons: ActiveBoons = {};
    applyTimedBoon(boons, 'nuke');
    expect(boons.nuke).toBeUndefined();
  });

  it('re-collecting refreshes the timer rather than stacking duration', () => {
    const boons: ActiveBoons = {};
    applyTimedBoon(boons, 'shield');
    tickBoons(boons, 3);
    applyTimedBoon(boons, 'shield');
    // Refreshed back to full — NOT duration + remaining.
    expect(boonRemaining(boons, 'shield')).toBe(BOONS.shield.duration);
  });

  it('refreshing never shortens a longer remaining timer', () => {
    const boons: ActiveBoons = { shield: 99 };
    applyTimedBoon(boons, 'shield');
    expect(boonRemaining(boons, 'shield')).toBe(99);
  });

  it('ticking burns down, reports expiry once, and deletes the key', () => {
    const boons: ActiveBoons = {};
    applyTimedBoon(boons, 'freeze');
    expect(tickBoons(boons, 1)).toEqual([]);
    const expired = tickBoons(boons, BOONS.freeze.duration);
    expect(expired).toEqual(['freeze']);
    expect(boons.freeze).toBeUndefined();
    // Already gone — a second tick must not re-report it.
    expect(tickBoons(boons, 1)).toEqual([]);
  });

  it('expires several boons in one tick', () => {
    const boons: ActiveBoons = { shield: 0.1, magnet: 0.1 };
    expect(tickBoons(boons, 1).sort()).toEqual(['magnet', 'shield']);
    expect(Object.keys(boons)).toEqual([]);
  });

  it('boonActive is false for an absent or exhausted boon', () => {
    expect(boonActive(undefined, 'shield')).toBe(false);
    expect(boonActive({}, 'shield')).toBe(false);
    expect(boonActive({ shield: 0 }, 'shield')).toBe(false);
  });
});

describe('multipliers read as inert when nothing is active', () => {
  const none: ActiveBoons = {};

  it('every multiplier is neutral on an empty record', () => {
    expect(damageMult(none)).toBe(1);
    expect(fireIntervalMult(none)).toBe(1);
    expect(coinValue(none)).toBe(1);
    expect(enemyBulletMult(none)).toBe(1);
    expect(enemiesFrozen(none)).toBe(false);
    expect(isShielded(none)).toBe(false);
  });

  it('and on undefined, which is what an older snapshot resumes with', () => {
    expect(damageMult(undefined)).toBe(1);
    expect(coinValue(undefined)).toBe(1);
    expect(enemiesFrozen(undefined)).toBe(false);
    expect(isShielded(undefined)).toBe(false);
  });

  it('each multiplier responds to its own boon and no other', () => {
    expect(damageMult({ damageBoost: 5 })).toBe(DAMAGE_BOOST_MULT);
    expect(damageMult({ fireBoost: 5 })).toBe(1);
    expect(coinValue({ doubleCoins: 5 })).toBe(COIN_MULT);
    expect(fireIntervalMult({ fireBoost: 5 })).toBeLessThan(1);
    expect(enemyBulletMult({ slowmo: 5 })).toBeLessThan(1);
    expect(enemiesFrozen({ freeze: 5 })).toBe(true);
    expect(isShielded({ shield: 5 })).toBe(true);
  });
});
