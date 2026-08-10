// Progression data model: currencies, lifetime statistics and the permanent
// upgrade ledger. Pure data + pure functions — no AsyncStorage, no React. The
// persistence layer (storage.ts) owns reading/writing/migrating this shape; the
// game and the UI only ever read it through the helpers here.
//
// Design rule for everything in this file: it must be safe to ADD a field
// without writing a migration. Counters default to 0 and upgrade levels are
// stored sparsely, so an older save simply reads as "hasn't done that yet".

import type { IconName } from '../components/Icon';

// --- Currencies ---------------------------------------------------------------
// Coins are the everyday spend, earned every run. The three deep currencies are
// gated behind bosses and elites so late-game upgrades need play, not grinding
// wave 1 — but coins never stop mattering, because every track's early levels
// (the ones you re-buy on each new hull) are coin-only.
export type Currency = 'coins' | 'crystals' | 'chips' | 'alloy';

export const CURRENCIES: Currency[] = ['coins', 'crystals', 'chips', 'alloy'];

export interface CurrencyDef {
  name: string;
  icon: IconName;
  /** One-line explanation of where it comes from, shown in the UI. */
  source: string;
}

export const CURRENCY_DEFS: Record<Currency, CurrencyDef> = {
  coins: { name: 'Coins', icon: 'coin', source: 'Collected in flight and dropped by bosses.' },
  crystals: { name: 'Crystals', icon: 'crystal', source: 'Dropped by elite enemies and giant bosses.' },
  chips: { name: 'Chips', icon: 'chip', source: 'Salvaged from mini bosses and deep waves.' },
  alloy: { name: 'Rare Alloy', icon: 'alloy', source: 'Only giant bosses carry it — needed for max-level upgrades.' },
};

/** A cost in one or more currencies. Absent key = costs none of it. */
export type Price = Partial<Record<Currency, number>>;

/** A wallet snapshot, decoupled from how the save happens to store it. */
export type Balance = Record<Currency, number>;

export const ZERO_BALANCE: Balance = { coins: 0, crystals: 0, chips: 0, alloy: 0 };

export function canAfford(bal: Balance, price: Price): boolean {
  for (const c of CURRENCIES) {
    const need = price[c] ?? 0;
    if (need > 0 && bal[c] < need) return false;
  }
  return true;
}

/**
 * Deduct a price. Returns a new balance, floored at zero per currency so a
 * rounding slip can never leave a negative wallet on screen.
 */
export function debit(bal: Balance, price: Price): Balance {
  const out = { ...bal };
  for (const c of CURRENCIES) out[c] = Math.max(0, out[c] - (price[c] ?? 0));
  return out;
}

export function credit(bal: Balance, price: Price): Balance {
  const out = { ...bal };
  for (const c of CURRENCIES) out[c] = out[c] + (price[c] ?? 0);
  return out;
}

/** The currencies a price actually asks for, in display order. */
export function priceParts(price: Price): { currency: Currency; amount: number }[] {
  return CURRENCIES.filter((c) => (price[c] ?? 0) > 0).map((c) => ({ currency: c, amount: price[c]! }));
}

// --- Lifetime statistics -----------------------------------------------------
// Every counter the game tracks forever. Missions, achievements and milestones
// are all expressed as thresholds over these, so adding a counter here is what
// makes a new objective possible.
export interface Stats {
  runs: number;
  timePlayed: number; // seconds across all runs
  totalAltitude: number; // metres, summed over every run
  /** Deepest wave ever reached — a high-water mark, not a total. */
  highestWave: number;
  /** Furthest single-run climb, in metres. Also a high-water mark. */
  bestAltitude: number;
  /** Best single-run score, and the lifetime total. */
  bestScore: number;
  totalScore: number;
  /** Best chain multiplier ever reached. */
  bestMult: number;
  grazes: number;
  kills: number;
  eliteKills: number;
  miniBossKills: number;
  giantBossKills: number;
  /**
   * Mini + giant together. Stored rather than derived so an objective can name
   * a single metric ("kill 25 bosses") instead of needing to sum two.
   */
  bossKills: number;
  coinsCollected: number;
  crystalsCollected: number;
  damageDealt: number;
  shotsFired: number;
  shotsHit: number;
  pickupsCollected: number;
  heartsCollected: number;
  bombsUsed: number;
  specialsUsed: number;
  deaths: number;
  /** Bosses killed without the player losing a heart while they were on screen. */
  perfectBosses: number;
  /**
   * Waves cleared without taking a single hit.
   *
   * Deliberately per-WAVE, not per-run: the game is endless and every run ends
   * in death, so a "no damage run" could never be achieved and would be a dead
   * counter behind an unreachable achievement.
   */
  flawlessWaves: number;
  upgradesBought: number;
}

export const ZERO_STATS: Stats = {
  runs: 0,
  timePlayed: 0,
  totalAltitude: 0,
  highestWave: 0,
  bestAltitude: 0,
  bestScore: 0,
  totalScore: 0,
  bestMult: 0,
  grazes: 0,
  kills: 0,
  eliteKills: 0,
  miniBossKills: 0,
  giantBossKills: 0,
  bossKills: 0,
  coinsCollected: 0,
  crystalsCollected: 0,
  damageDealt: 0,
  shotsFired: 0,
  shotsHit: 0,
  pickupsCollected: 0,
  heartsCollected: 0,
  bombsUsed: 0,
  specialsUsed: 0,
  deaths: 0,
  perfectBosses: 0,
  flawlessWaves: 0,
  upgradesBought: 0,
};

export const freshStats = (): Stats => ({ ...ZERO_STATS });

/**
 * Fill in any counter a stored save predates. Kept separate from the migration
 * chain on purpose: new counters are additive by design, so they need topping
 * up on every load rather than a version bump.
 */
export function normalizeStats(raw: Partial<Stats> | undefined): Stats {
  const out = freshStats();
  if (!raw) return out;
  for (const k of Object.keys(out) as (keyof Stats)[]) {
    const v = raw[k];
    // Guard against a corrupted or hand-edited save putting a non-number here:
    // one NaN in a counter would poison every threshold compared against it.
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** What one finished run contributed. Merged into lifetime stats on game over. */
export type StatDelta = Partial<Stats>;

export type StatKey = keyof Stats;

/**
 * Counters that record a BEST rather than a total.
 *
 * Summing these would make a "reach wave 30" goal satisfiable by playing thirty
 * one-wave runs, which is the opposite of what it asks for.
 */
export const HIGH_WATER_STATS: ReadonlySet<StatKey> = new Set<StatKey>([
  'highestWave',
  'bestAltitude',
  'bestScore',
  'bestMult',
]);

export function addStats(base: Stats, delta: StatDelta): Stats {
  const out = { ...base };
  for (const k of Object.keys(delta) as StatKey[]) {
    const v = delta[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[k] = HIGH_WATER_STATS.has(k) ? Math.max(out[k], v) : out[k] + v;
  }
  return out;
}

// --- Permanent upgrades ------------------------------------------------------
// Levels are PER SHIP: buying a hull means investing in it, which is what keeps
// coins valuable long after every ship is unlocked. Stored sparsely
// (`{}` = everything at level 0), so a save from before a track existed reads
// as simply not having bought into it.
export type UpgradeKind =
  | 'damage'
  | 'fireRate'
  | 'hull' // max hearts
  | 'critChance'
  | 'critDamage'
  | 'bulletSpeed'
  | 'energy' // special-meter recharge
  | 'agility' // movement responsiveness
  | 'bombs'; // bombs carried + bomb damage

export const UPGRADE_KINDS: UpgradeKind[] = [
  'damage',
  'fireRate',
  'hull',
  'critChance',
  'critDamage',
  'bulletSpeed',
  'energy',
  'agility',
  'bombs',
];

/** shipId → track → level. Sparse at every level. */
export type UpgradeLevels = Partial<Record<UpgradeKind, number>>;
export type UpgradeBook = Record<string, UpgradeLevels>;

export function levelOf(book: UpgradeBook, shipId: string, kind: UpgradeKind): number {
  const lvl = book[shipId]?.[kind];
  return typeof lvl === 'number' && Number.isFinite(lvl) && lvl > 0 ? Math.floor(lvl) : 0;
}

/** Total levels bought on a hull — drives its visual "upgraded" tier. */
export function shipInvestment(book: UpgradeBook, shipId: string): number {
  const levels = book[shipId];
  if (!levels) return 0;
  let sum = 0;
  for (const k of UPGRADE_KINDS) sum += levelOf(book, shipId, k);
  return sum;
}

export function withLevel(
  book: UpgradeBook,
  shipId: string,
  kind: UpgradeKind,
  level: number
): UpgradeBook {
  return { ...book, [shipId]: { ...book[shipId], [kind]: level } };
}

/**
 * Drop unknown ships and unknown tracks, and clamp levels into range. Runs on
 * load so a save written by a build that had a track we since renamed can't
 * feed a junk level into the stat maths.
 */
export function normalizeUpgrades(
  raw: unknown,
  knownShipIds: readonly string[],
  maxLevel: number
): UpgradeBook {
  const out: UpgradeBook = {};
  if (!raw || typeof raw !== 'object') return out;
  const book = raw as Record<string, unknown>;
  for (const shipId of knownShipIds) {
    const levels = book[shipId];
    if (!levels || typeof levels !== 'object') continue;
    const src = levels as Record<string, unknown>;
    const kept: UpgradeLevels = {};
    for (const kind of UPGRADE_KINDS) {
      const v = src[kind];
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue;
      kept[kind] = Math.max(0, Math.min(maxLevel, Math.floor(v)));
    }
    if (Object.keys(kept).length) out[shipId] = kept;
  }
  return out;
}
