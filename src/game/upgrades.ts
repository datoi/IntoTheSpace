// Permanent ship upgrades: the long-term reason coins keep mattering.
//
// Two halves:
//   • the CATALOG — what each track does, how far it goes, what it costs;
//   • the RESOLVER — turning a save's levels into a flat `ShipStats` the game
//     loop reads instead of the raw constants.
//
// The resolver is the important boundary. GameScreen never asks "what level is
// fire rate?" — it asks for `stats.fireRate` and gets a number. That keeps the
// balance maths in one testable place and means a save with no upgrades yields
// exactly today's constants, so existing players' runs feel unchanged.

import type { IconName } from '../components/Icon';
import {
  FIRE_RATE,
  BULLET_DMG,
  BULLET_SPEED,
  HEARTS_START,
  HEARTS_MAX,

  DRAG_LERP,
  BOMB_BASE_CAPACITY,
  BOMB_NUKE_DMG,
  CRIT_BASE_MULT,
} from './constants';
import { Price, UpgradeKind, UPGRADE_KINDS, UpgradeBook, levelOf, shipInvestment } from './progression';

// --- Catalog -----------------------------------------------------------------

export interface UpgradeTrackDef {
  kind: UpgradeKind;
  name: string;
  /** What the player is buying, in their words. */
  desc: string;
  icon: IconName;
  maxLevel: number;
  /** Coin cost of the FIRST level. Later levels scale by `growth`. */
  baseCoins: number;
  /** Exponential cost multiplier per level bought. */
  growth: number;
  /**
   * From this level up, the purchase also demands deep currencies (chips, then
   * alloy at the very top). This is what stops a player from maxing everything
   * off wave-1 coin farming — the last levels need bosses and elites.
   */
  chipsFrom?: number;
  crystalsFrom?: number;
  alloyFrom?: number;
  /** Human-readable effect of one level, for the upgrade screen. */
  perLevelLabel: string;
}

/** Levels beyond this are impossible on any track — a hard configurable ceiling. */
export const MAX_UPGRADE_LEVEL = 10;

export const UPGRADE_TRACKS: Record<UpgradeKind, UpgradeTrackDef> = {
  damage: {
    kind: 'damage',
    name: 'Weapon Core',
    desc: 'Every shot you fire lands harder.',
    icon: 'damage-up',
    maxLevel: 10,
    baseCoins: 45,
    growth: 1.45,
    chipsFrom: 6,
    alloyFrom: 9,
    perLevelLabel: '+12% damage',
  },
  fireRate: {
    kind: 'fireRate',
    name: 'Autoloader',
    desc: 'Shortens the gap between shots.',
    icon: 'firerate-up',
    maxLevel: 10,
    baseCoins: 55,
    growth: 1.48,
    chipsFrom: 6,
    alloyFrom: 9,
    perLevelLabel: '-4% shot delay',
  },
  hull: {
    // Deliberately short: hearts are the most powerful stat in the game, so
    // this track tops out early rather than trivialising the difficulty curve.
    kind: 'hull',
    name: 'Hull Plating',
    desc: 'Launch every run with more hearts.',
    icon: 'shield',
    maxLevel: 5,
    baseCoins: 90,
    growth: 1.7,
    chipsFrom: 3,
    alloyFrom: 5,
    perLevelLabel: '+1 starting heart',
  },
  critChance: {
    kind: 'critChance',
    name: 'Targeting Array',
    desc: 'Chance for a shot to crit for bonus damage.',
    icon: 'objectives',
    maxLevel: 10,
    baseCoins: 60,
    growth: 1.46,
    chipsFrom: 5,
    crystalsFrom: 8,
    perLevelLabel: '+3% crit chance',
  },
  critDamage: {
    kind: 'critDamage',
    name: 'Overcharge',
    desc: 'Makes each critical hit hit far harder.',
    icon: 'damage-up',
    maxLevel: 10,
    baseCoins: 50,
    growth: 1.44,
    chipsFrom: 6,
    crystalsFrom: 9,
    perLevelLabel: '+15% crit damage',
  },
  bulletSpeed: {
    kind: 'bulletSpeed',
    name: 'Rail Tuning',
    desc: 'Your shots cross the screen faster.',
    icon: 'gun-laser',
    maxLevel: 10,
    baseCoins: 35,
    growth: 1.4,
    chipsFrom: 7,
    perLevelLabel: '+6% bullet speed',
  },
  energy: {
    kind: 'energy',
    name: 'Energy Cell',
    // Energy is earned from kills and grazes rather than trickling in on a
    // timer, so this track boosts how much each of those pays instead of
    // shortening a fill time that no longer exists. Stored levels are
    // unaffected — a player who bought five keeps five, they just do something
    // different now.
    desc: 'Every kill and graze feeds your special harder.',
    icon: 'energy-cell',
    maxLevel: 10,
    baseCoins: 70,
    growth: 1.5,
    chipsFrom: 5,
    crystalsFrom: 8,
    perLevelLabel: '+8% energy gained',
  },
  agility: {
    kind: 'agility',
    name: 'Thrusters',
    desc: 'The hull answers the finger more sharply.',
    icon: 'swift',
    maxLevel: 8,
    baseCoins: 40,
    growth: 1.42,
    chipsFrom: 6,
    perLevelLabel: '+5% handling',
  },
  bombs: {
    kind: 'bombs',
    name: 'Bomb Bay',
    desc: 'Carry more bombs, and detonate them harder.',
    icon: 'bomb',
    maxLevel: 5,
    baseCoins: 80,
    growth: 1.6,
    chipsFrom: 3,
    alloyFrom: 5,
    perLevelLabel: '+1 bomb, +25% blast',
  },
};

/** Tracks in the order the upgrade screen lists them. */
export const UPGRADE_ORDER: UpgradeKind[] = UPGRADE_KINDS;

// --- Costs -------------------------------------------------------------------

/** Coin costs are rounded to a readable step rather than left as 213.7. */
const roundCoins = (n: number): number => (n < 100 ? Math.round(n / 5) * 5 : Math.round(n / 10) * 10);

/**
 * What it costs to go from `level` to `level + 1`. Returns an empty price for a
 * maxed track — callers should check `isMaxed` first, but a zero price with
 * `canAfford` returning true would silently allow a free level, so the maxed
 * case is guarded here too.
 */
export function upgradeCost(kind: UpgradeKind, level: number): Price {
  const def = UPGRADE_TRACKS[kind];
  if (level >= def.maxLevel) return {};
  const next = level + 1; // the level being bought
  const price: Price = { coins: roundCoins(def.baseCoins * Math.pow(def.growth, level)) };
  // Deep currencies scale linearly with how far past the gate you are — they're
  // meant to be a pacing gate, not a second exponential wall on top of coins.
  if (def.chipsFrom && next >= def.chipsFrom) {
    price.chips = 1 + (next - def.chipsFrom) * 2;
  }
  if (def.crystalsFrom && next >= def.crystalsFrom) {
    price.crystals = 1 + (next - def.crystalsFrom);
  }
  if (def.alloyFrom && next >= def.alloyFrom) {
    price.alloy = 1 + (next - def.alloyFrom);
  }
  return price;
}

export function maxLevelOf(kind: UpgradeKind): number {
  return Math.min(UPGRADE_TRACKS[kind].maxLevel, MAX_UPGRADE_LEVEL);
}

export function isMaxed(book: UpgradeBook, shipId: string, kind: UpgradeKind): boolean {
  return levelOf(book, shipId, kind) >= maxLevelOf(kind);
}

// --- Resolved stats ----------------------------------------------------------

/**
 * Everything the game loop needs from the progression system, flattened. The
 * loop reads these and never touches an upgrade level directly.
 */
export interface ShipStats {
  /** Damage multiplier on every player projectile. */
  dmgMult: number;
  /** Seconds between shots for the default gun (already includes fire rate). */
  fireRate: number;
  /** Multiplier applied to any gun's own fire interval (bomb/laser/homing). */
  fireIntervalMult: number;
  bulletSpeed: number;
  startHearts: number;
  critChance: number; // 0..1
  critMult: number; // damage multiplier on a crit
  /** Multiplier on every energy gain (kills, grazes, clears). */
  energyMult: number;
  dragLerp: number; // how sharply the hull tracks the finger
  bombCapacity: number;
  bombDmg: number;
  /** 0..4 cosmetic tier — which of the five hull builds is flown. */
  tier: number;
  /** Sum of all levels bought on this hull. */
  investment: number;
}

/**
 * Investment that earns each build level, so tier 0..4 = the five hull sprites.
 *
 * The first three are unchanged from when this drove nothing but a label, so no
 * existing hull silently drops a level. The fourth is deliberately far out (78
 * is the theoretical maximum across all nine tracks): the top build should be
 * something a player is still working toward deep into a save, not a milestone
 * they pass without noticing.
 */
export const TIER_THRESHOLDS = [8, 20, 36, 56];

export function visualTier(investment: number): number {
  let tier = 0;
  for (const t of TIER_THRESHOLDS) if (investment >= t) tier++;
  return tier;
}

/** A ship with nothing bought — exactly the game's original balance. */
export const BASE_SHIP_STATS: ShipStats = {
  dmgMult: 1,
  fireRate: FIRE_RATE,
  fireIntervalMult: 1,
  bulletSpeed: BULLET_SPEED,
  startHearts: HEARTS_START,
  critChance: 0,
  critMult: CRIT_BASE_MULT,
  energyMult: 1,
  dragLerp: DRAG_LERP,
  bombCapacity: BOMB_BASE_CAPACITY,
  bombDmg: BOMB_NUKE_DMG,
  tier: 0,
  investment: 0,
};

/**
 * Fold a hull's upgrade levels into a flat stat block.
 *
 * Every term is written so level 0 contributes nothing, which is what
 * guarantees an un-upgraded ship plays byte-identically to the pre-upgrade
 * build. Multipliers compose additively (1 + n·level) rather than
 * multiplicatively (1.12^level) on purpose: additive keeps the top of a track
 * predictable and stops two maxed tracks from multiplying into absurdity.
 */
export function resolveShipStats(book: UpgradeBook, shipId: string): ShipStats {
  const lv = (k: UpgradeKind) => Math.min(levelOf(book, shipId, k), maxLevelOf(k));
  const investment = shipInvestment(book, shipId);

  const fireIntervalMult = Math.max(0.35, 1 - 0.04 * lv('fireRate'));
  const bombLv = lv('bombs');

  return {
    dmgMult: 1 + 0.12 * lv('damage'),
    fireRate: FIRE_RATE * fireIntervalMult,
    fireIntervalMult,
    bulletSpeed: BULLET_SPEED * (1 + 0.06 * lv('bulletSpeed')),
    // Never above the global heart ceiling: the health bar is drawn against
    // HEARTS_MAX, so a start above it would render as an overfull column.
    startHearts: Math.min(HEARTS_MAX, HEARTS_START + lv('hull')),
    critChance: Math.min(0.9, 0.03 * lv('critChance')),
    critMult: CRIT_BASE_MULT + 0.15 * lv('critDamage'),
    energyMult: 1 + 0.08 * lv('energy'),
    dragLerp: DRAG_LERP * (1 + 0.05 * lv('agility')),
    bombCapacity: BOMB_BASE_CAPACITY + bombLv,
    bombDmg: BOMB_NUKE_DMG * (1 + 0.25 * bombLv),
    tier: visualTier(investment),
    investment,
  };
}

/**
 * Roll a shot's damage, including a crit. Returns the damage and whether it
 * crit, so the caller can colour the hit feedback.
 *
 * `rng` is injectable so tests can pin the roll — the game passes Math.random.
 */
export function rollDamage(
  base: number,
  stats: ShipStats,
  rng: () => number = Math.random
): { dmg: number; crit: boolean } {
  const scaled = base * stats.dmgMult;
  if (stats.critChance > 0 && rng() < stats.critChance) {
    return { dmg: scaled * stats.critMult, crit: true };
  }
  return { dmg: scaled, crit: false };
}

/** Base damage of a bullet before upgrades — kept here so callers stay tidy. */
export const baseBulletDamage = (): number => BULLET_DMG;
