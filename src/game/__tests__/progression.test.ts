/**
 * The progression data model. These are the invariants the rest of the game
 * trusts blindly: that an un-upgraded ship is unchanged, that a maxed track
 * can't be pushed further, that a corrupt save degrades instead of poisoning
 * the stat maths, and that costs actually climb.
 */
import {
  ZERO_BALANCE,
  addStats,
  canAfford,
  credit,
  debit,
  freshStats,
  levelOf,
  normalizeStats,
  normalizeUpgrades,
  priceParts,
  shipInvestment,
  withLevel,
  UpgradeBook,
} from '../progression';
import {
  BASE_SHIP_STATS,
  MAX_UPGRADE_LEVEL,
  UPGRADE_ORDER,
  UPGRADE_TRACKS,
  isMaxed,
  maxLevelOf,
  resolveShipStats,
  rollDamage,
  upgradeCost,
  visualTier,
} from '../upgrades';
import { AVATARS, FIRE_RATE, HEARTS_START, HEARTS_MAX, BULLET_SPEED } from '../constants';

const SHIP = 'ironclad';
const shipIds = AVATARS.map((a) => a.id);

describe('wallet arithmetic', () => {
  it('affords an exact balance but not one short', () => {
    const bal = { ...ZERO_BALANCE, coins: 100, chips: 2 };
    expect(canAfford(bal, { coins: 100, chips: 2 })).toBe(true);
    expect(canAfford(bal, { coins: 101 })).toBe(false);
    expect(canAfford(bal, { coins: 100, chips: 3 })).toBe(false);
  });

  it('ignores currencies a price does not ask for', () => {
    expect(canAfford({ ...ZERO_BALANCE, coins: 5 }, { coins: 5 })).toBe(true);
  });

  it('debit never leaves a negative wallet', () => {
    const out = debit({ ...ZERO_BALANCE, coins: 10 }, { coins: 999, alloy: 5 });
    expect(out.coins).toBe(0);
    expect(out.alloy).toBe(0);
  });

  it('credit adds only the named currencies', () => {
    const out = credit(ZERO_BALANCE, { crystals: 3 });
    expect(out).toEqual({ ...ZERO_BALANCE, crystals: 3 });
  });

  it('priceParts lists only non-zero entries', () => {
    expect(priceParts({ coins: 10, chips: 0, crystals: 2 })).toEqual([
      { currency: 'coins', amount: 10 },
      { currency: 'crystals', amount: 2 },
    ]);
  });
});

describe('stat merging', () => {
  it('sums counters but takes a high-water mark for highestWave', () => {
    const base = { ...freshStats(), kills: 10, highestWave: 12 };
    const merged = addStats(base, { kills: 5, highestWave: 7 });
    expect(merged.kills).toBe(15);
    // 7 < 12 — summing here would let 30 one-wave runs "reach wave 30".
    expect(merged.highestWave).toBe(12);
    expect(addStats(base, { highestWave: 20 }).highestWave).toBe(20);
  });

  it('ignores non-finite deltas rather than poisoning a counter', () => {
    const merged = addStats(freshStats(), { kills: NaN, coinsCollected: Infinity });
    expect(merged.kills).toBe(0);
    expect(merged.coinsCollected).toBe(0);
  });

  it('normalizeStats fills counters a stored save predates', () => {
    const out = normalizeStats({ kills: 4 });
    expect(out.kills).toBe(4);
    expect(out.runs).toBe(0);
    expect(Object.keys(out).sort()).toEqual(Object.keys(freshStats()).sort());
  });

  it('normalizeStats rejects a junk value instead of trusting it', () => {
    const out = normalizeStats({ kills: 'lots' as unknown as number, runs: NaN });
    expect(out.kills).toBe(0);
    expect(out.runs).toBe(0);
  });
});

describe('upgrade book', () => {
  it('reads level 0 for anything unbought', () => {
    expect(levelOf({}, SHIP, 'damage')).toBe(0);
  });

  it('withLevel does not mutate the book it was given', () => {
    const book: UpgradeBook = {};
    const next = withLevel(book, SHIP, 'damage', 3);
    expect(book).toEqual({});
    expect(levelOf(next, SHIP, 'damage')).toBe(3);
  });

  it('keeps levels per ship, not global', () => {
    const book = withLevel({}, SHIP, 'damage', 4);
    expect(levelOf(book, 'specter', 'damage')).toBe(0);
  });

  it('investment sums every track on the hull', () => {
    let book = withLevel({}, SHIP, 'damage', 3);
    book = withLevel(book, SHIP, 'hull', 2);
    expect(shipInvestment(book, SHIP)).toBe(5);
  });

  it('normalizeUpgrades drops unknown ships, unknown tracks and clamps levels', () => {
    const out = normalizeUpgrades(
      {
        ironclad: { damage: 4, notATrack: 9, fireRate: 999, hull: -3 },
        'ship-that-was-deleted': { damage: 5 },
      },
      shipIds,
      MAX_UPGRADE_LEVEL
    );
    expect(out['ship-that-was-deleted']).toBeUndefined();
    expect(out.ironclad).toEqual({ damage: 4, fireRate: MAX_UPGRADE_LEVEL });
  });

  it('normalizeUpgrades survives junk input', () => {
    expect(normalizeUpgrades(null, shipIds, 10)).toEqual({});
    expect(normalizeUpgrades('nope', shipIds, 10)).toEqual({});
  });
});

describe('upgrade costs', () => {
  it('climbs with every level on every track', () => {
    for (const kind of UPGRADE_ORDER) {
      const max = maxLevelOf(kind);
      let prev = 0;
      for (let lv = 0; lv < max; lv++) {
        const coins = upgradeCost(kind, lv).coins ?? 0;
        expect(coins).toBeGreaterThan(prev);
        prev = coins;
      }
    }
  });

  it('returns an empty price at max level, so a maxed track cannot be bought', () => {
    for (const kind of UPGRADE_ORDER) {
      expect(upgradeCost(kind, maxLevelOf(kind))).toEqual({});
      expect(isMaxed(withLevel({}, SHIP, kind, maxLevelOf(kind)), SHIP, kind)).toBe(true);
    }
  });

  it('gates deep currencies behind the configured level, not before', () => {
    const def = UPGRADE_TRACKS.damage;
    const gate = def.chipsFrom!;
    // Buying the level BELOW the gate costs no chips…
    expect(upgradeCost('damage', gate - 2).chips).toBeUndefined();
    // …and the level AT the gate does.
    expect(upgradeCost('damage', gate - 1).chips).toBeGreaterThan(0);
  });

  it('never exceeds MAX_UPGRADE_LEVEL however a track is configured', () => {
    for (const kind of UPGRADE_ORDER) {
      expect(maxLevelOf(kind)).toBeLessThanOrEqual(MAX_UPGRADE_LEVEL);
    }
  });
});

describe('resolveShipStats', () => {
  it('an un-upgraded hull reproduces the original constants exactly', () => {
    // This is the backwards-compatibility guarantee: existing players' ships
    // must play identically until they buy something.
    const stats = resolveShipStats({}, SHIP);
    expect(stats.fireRate).toBe(FIRE_RATE);
    expect(stats.dmgMult).toBe(1);
    expect(stats.bulletSpeed).toBe(BULLET_SPEED);
    expect(stats.startHearts).toBe(HEARTS_START);
    expect(stats.critChance).toBe(0);
    expect(stats.investment).toBe(0);
    expect(stats.tier).toBe(0);
    expect(stats).toEqual(BASE_SHIP_STATS);
  });

  it('damage and fire rate move in the helpful direction', () => {
    const book = withLevel(withLevel({}, SHIP, 'damage', 10), SHIP, 'fireRate', 10);
    const stats = resolveShipStats(book, SHIP);
    expect(stats.dmgMult).toBeCloseTo(2.2);
    expect(stats.fireRate).toBeLessThan(FIRE_RATE); // shorter gap = faster
    expect(stats.fireIntervalMult).toBeCloseTo(0.6);
  });

  it('starting hearts never exceed the global ceiling the bar is drawn against', () => {
    const book = withLevel({}, SHIP, 'hull', maxLevelOf('hull'));
    expect(resolveShipStats(book, SHIP).startHearts).toBeLessThanOrEqual(HEARTS_MAX);
  });

  it('clamps a level above the track max instead of scaling past it', () => {
    const sane = resolveShipStats(withLevel({}, SHIP, 'hull', maxLevelOf('hull')), SHIP);
    const absurd = resolveShipStats(withLevel({}, SHIP, 'hull', 999), SHIP);
    expect(absurd.startHearts).toBe(sane.startHearts);
  });

  it('the Energy Cell track raises energy GAIN, not a charge time', () => {
    // Energy is earned from kills and grazes rather than trickling in on a
    // timer, so this track scales what each of those pays. An un-upgraded hull
    // must sit at exactly ×1 — that's the backwards-compatibility guarantee.
    expect(resolveShipStats({}, SHIP).energyMult).toBe(1);
    const maxed = resolveShipStats(withLevel({}, SHIP, 'energy', maxLevelOf('energy')), SHIP);
    expect(maxed.energyMult).toBeGreaterThan(1);
    expect(maxed.energyMult).toBeGreaterThan(BASE_SHIP_STATS.energyMult);
  });

  it('bomb bay raises both capacity and blast', () => {
    const book = withLevel({}, SHIP, 'bombs', 3);
    const stats = resolveShipStats(book, SHIP);
    expect(stats.bombCapacity).toBe(BASE_SHIP_STATS.bombCapacity + 3);
    expect(stats.bombDmg).toBeGreaterThan(BASE_SHIP_STATS.bombDmg);
  });

  it('visual tier steps up with total investment', () => {
    expect(visualTier(0)).toBe(0);
    expect(visualTier(8)).toBe(1);
    expect(visualTier(999)).toBe(3);
  });
});

describe('rollDamage', () => {
  it('never crits at zero crit chance, whatever the roll', () => {
    const stats = resolveShipStats({}, SHIP);
    expect(rollDamage(10, stats, () => 0)).toEqual({ dmg: 10, crit: false });
    expect(rollDamage(10, stats, () => 0.999)).toEqual({ dmg: 10, crit: false });
  });

  it('crits when the roll lands under the chance, and multiplies', () => {
    const book = withLevel(withLevel({}, SHIP, 'critChance', 10), SHIP, 'critDamage', 10);
    const stats = resolveShipStats(book, SHIP);
    const hit = rollDamage(10, stats, () => 0);
    expect(hit.crit).toBe(true);
    expect(hit.dmg).toBeCloseTo(10 * stats.dmgMult * stats.critMult);
  });

  it('does not crit when the roll is above the chance', () => {
    const stats = resolveShipStats(withLevel({}, SHIP, 'critChance', 5), SHIP);
    expect(rollDamage(10, stats, () => 0.99).crit).toBe(false);
  });

  it('applies the damage multiplier on a non-crit too', () => {
    const stats = resolveShipStats(withLevel({}, SHIP, 'damage', 5), SHIP);
    expect(rollDamage(10, stats, () => 0.99).dmg).toBeCloseTo(10 * stats.dmgMult);
  });
});
