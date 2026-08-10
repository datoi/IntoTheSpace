// Utility pickups ("boons") — the non-weapon drops.
//
// The game already had three drop types (gun / heart / coin). This adds a
// fourth card kind, 'boon', which covers everything else: shields, magnets,
// stat boosts, crowd control and instant payoffs. Guns deliberately stay on
// their own 'gift' track so the existing gun-stacking mechanic is untouched.
//
// Boons come in two flavours, distinguished by `duration`:
//   • TIMED  (duration > 0) — writes `seconds remaining` into GameState.boons
//     and is read by the loop while it burns down.
//   • INSTANT (duration === 0) — resolves once at pickup and stores nothing.
//
// Timed boons live in ONE record keyed by kind rather than a field per effect.
// That's what keeps this extensible: a new boon needs a catalog entry and a
// read site, never a new GameState field or a save migration.

import type { IconName } from '../components/Icon';
import { PALETTE } from './constants';

export type BoonKind =
  // Timed
  | 'shield'
  | 'magnet'
  | 'damageBoost'
  | 'fireBoost'
  | 'freeze'
  | 'slowmo'
  | 'doubleCoins'
  // Instant
  | 'repair'
  | 'extraHeart'
  | 'nuke'
  | 'bombPack'
  | 'energy'
  | 'luckyDrop';

export interface BoonDef {
  kind: BoonKind;
  /** Shown on the HUD and in the pickup guide. */
  name: string;
  /**
   * The glyph drawn on the falling badge and its HUD chip — this is how the
   * player reads the drop. An icon NAME, not an emoji: emoji cannot be tinted,
   * render differently per OS, and were indistinguishable at chip size.
   */
  icon: IconName;
  /** Badge tint. Families share a hue so the drop reads at a glance. */
  color: string;
  /** Player-facing explanation for the guide screen. */
  desc: string;
  /** Seconds the effect lasts; 0 = instant one-shot. */
  duration: number;
  /**
   * Relative spawn weight. Stronger effects weigh less, so a nuke stays a
   * moment and a fire-rate boost stays common.
   */
  weight: number;
  /**
   * Waves before which this never drops. Keeps the early game legible — a
   * new player shouldn't meet freeze-time on wave 2.
   */
  minWave?: number;
}

// Four families, one token each, so a falling badge is categorised before it's
// read: plasma = defensive, amber = offensive, violet = control, gold = economy.
//
// Every one of these used to be a hex literal, and two of them broke the
// friend/foe rule outright — Damage Boost was painted in the danger colour, and
// Extra Heart in hostile magenta. A pickup must never wear a hostile hue.
const DEFENSIVE = PALETTE.plasma;
const OFFENSIVE = PALETTE.amber;
const CONTROL = PALETTE.violet;
const ECONOMY = PALETTE.gold;
// Health split out of DEFENSIVE: a shield and a heal do different jobs, and red
// is the one hue a player reads as "health" without being taught.
const VITAL = PALETTE.vital;
// The special meter has its own hue for the same reason — it is neither armour
// nor healing, and sharing plasma with the shield made the two chips a pair.
const CHARGE = PALETTE.energy;

export const BOONS: Record<BoonKind, BoonDef> = {
  // --- Defensive ---
  shield: {
    kind: 'shield',
    name: 'Shield',
    icon: 'shield',
    color: DEFENSIVE,
    desc: 'Nothing can touch you — every hit is absorbed while it holds.',
    duration: 6,
    weight: 10,
  },
  repair: {
    kind: 'repair',
    name: 'Restore Health',
    icon: 'repair',
    color: VITAL,
    desc: 'Patches the hull straight back up to full hearts.',
    duration: 0,
    weight: 6,
  },
  extraHeart: {
    kind: 'extraHeart',
    name: 'Extra Heart',
    icon: 'extra-heart',
    color: VITAL, // health red — NOT `threat`, which stays hostile-only
    desc: 'Raises your maximum hearts for this run, and fills the new one.',
    duration: 0,
    weight: 4,
  },
  // --- Offensive ---
  damageBoost: {
    kind: 'damageBoost',
    name: 'Damage Boost',
    icon: 'damage-up',
    color: OFFENSIVE,
    desc: 'Doubles the damage of everything you fire.',
    duration: 8,
    weight: 10,
  },
  fireBoost: {
    kind: 'fireBoost',
    name: 'Fire Rate Boost',
    icon: 'firerate-up',
    color: OFFENSIVE,
    desc: 'Your guns cycle far faster.',
    duration: 8,
    weight: 11,
  },
  nuke: {
    kind: 'nuke',
    name: 'Screen Nuke',
    icon: 'nuke',
    color: OFFENSIVE,
    desc: 'Detonates instantly: wipes every enemy shot and blasts the whole screen.',
    duration: 0,
    weight: 3,
    minWave: 4,
  },
  bombPack: {
    kind: 'bombPack',
    name: 'Bomb',
    icon: 'bomb',
    color: OFFENSIVE,
    desc: 'Loads another bomb into the bay for you to set off when you choose.',
    duration: 0,
    weight: 9,
  },
  // --- Control ---
  freeze: {
    kind: 'freeze',
    name: 'Freeze Time',
    icon: 'freeze',
    color: CONTROL,
    desc: 'Every enemy locks up — no movement, no firing.',
    duration: 4,
    weight: 5,
    minWave: 4,
  },
  slowmo: {
    kind: 'slowmo',
    name: 'Slow Motion',
    icon: 'slowmo',
    color: CONTROL,
    desc: 'Enemy fire crawls, giving you room to thread through it.',
    duration: 7,
    weight: 7,
    minWave: 3,
  },
  // --- Economy & utility ---
  magnet: {
    kind: 'magnet',
    name: 'Coin Magnet',
    icon: 'magnet',
    color: ECONOMY,
    desc: 'Coins on screen come to you instead of the other way round.',
    duration: 10,
    weight: 9,
  },
  doubleCoins: {
    kind: 'doubleCoins',
    name: 'Double Coins',
    icon: 'double-coins',
    color: ECONOMY,
    desc: 'Every coin you scoop up is worth two.',
    duration: 12,
    weight: 8,
  },
  energy: {
    kind: 'energy',
    name: 'Energy Cell',
    icon: 'energy-cell',
    color: CHARGE,
    desc: 'Fills your special meter on the spot.',
    duration: 0,
    weight: 7,
  },
  luckyDrop: {
    kind: 'luckyDrop',
    name: 'Lucky Drop',
    icon: 'lucky-drop',
    color: ECONOMY,
    desc: 'Bursts into a shower of coins.',
    duration: 0,
    weight: 5,
  },
};

export const BOON_KINDS = Object.keys(BOONS) as BoonKind[];

/** Timed boons, in the order the HUD stacks their remaining-time chips. */
export const TIMED_BOONS: BoonKind[] = BOON_KINDS.filter((k) => BOONS[k].duration > 0);

export const isInstant = (kind: BoonKind): boolean => BOONS[kind].duration === 0;

/**
 * Roll which boon a drop grants, respecting per-boon wave gates and weights.
 *
 * `rng` is injectable so tests can pin the roll. Falls back to 'shield' only if
 * the eligible pool is somehow empty — impossible with the current catalog
 * (several boons have no minWave), but a silent `undefined` here would spawn an
 * unrenderable card, so it's guarded rather than asserted.
 */
export function rollBoon(wave: number, rng: () => number = Math.random): BoonKind {
  const pool = BOON_KINDS.filter((k) => wave >= (BOONS[k].minWave ?? 0));
  if (!pool.length) return 'shield';
  let total = 0;
  for (const k of pool) total += BOONS[k].weight;
  let pick = rng() * total;
  for (const k of pool) {
    pick -= BOONS[k].weight;
    if (pick <= 0) return k;
  }
  return pool[pool.length - 1];
}

// --- Active-boon state -------------------------------------------------------
// kind → seconds remaining. Absent or <= 0 means inactive.
export type ActiveBoons = Partial<Record<BoonKind, number>>;

export const boonActive = (boons: ActiveBoons | undefined, kind: BoonKind): boolean =>
  (boons?.[kind] ?? 0) > 0;

export const boonRemaining = (boons: ActiveBoons | undefined, kind: BoonKind): number =>
  Math.max(0, boons?.[kind] ?? 0);

/**
 * Tick every timed boon down by `dt`, dropping expired ones.
 *
 * Mutates in place and returns the kinds that just ran out, so the caller can
 * announce them ("SHIELD DOWN") without diffing the record itself.
 */
export function tickBoons(boons: ActiveBoons, dt: number): BoonKind[] {
  const expired: BoonKind[] = [];
  for (const k of Object.keys(boons) as BoonKind[]) {
    const left = boons[k];
    if (left === undefined) continue;
    const next = left - dt;
    if (next <= 0) {
      delete boons[k];
      expired.push(k);
    } else {
      boons[k] = next;
    }
  }
  return expired;
}

/**
 * Start (or refresh) a timed boon. Re-collecting extends rather than stacks —
 * stacking multipliers is how a shoot'em up ends up unplayably trivial, and a
 * refreshed timer is the reward the player actually feels.
 */
export function applyTimedBoon(boons: ActiveBoons, kind: BoonKind): void {
  const def = BOONS[kind];
  if (def.duration <= 0) return;
  boons[kind] = Math.max(boons[kind] ?? 0, def.duration);
}

// --- Multipliers the loop reads ---------------------------------------------
// Each is a pure read over the active record, so the loop never branches on
// individual boon names in the hot path.

export const DAMAGE_BOOST_MULT = 2;
export const FIRE_BOOST_MULT = 0.55; // multiplier on the shot INTERVAL
export const SLOWMO_MULT = 0.4; // enemy bullet speed while slowed
export const COIN_MULT = 2;
export const MAGNET_RADIUS = 260; // px a magnet reaches
export const MAGNET_PULL = 620; // px/s a coin is dragged toward the ship
export const EXTRA_HEART_CEILING = 14; // hardest cap on a run's max hearts

export const damageMult = (b: ActiveBoons | undefined): number =>
  boonActive(b, 'damageBoost') ? DAMAGE_BOOST_MULT : 1;

export const fireIntervalMult = (b: ActiveBoons | undefined): number =>
  boonActive(b, 'fireBoost') ? FIRE_BOOST_MULT : 1;

export const coinValue = (b: ActiveBoons | undefined): number =>
  boonActive(b, 'doubleCoins') ? COIN_MULT : 1;

export const enemyBulletMult = (b: ActiveBoons | undefined): number =>
  boonActive(b, 'slowmo') ? SLOWMO_MULT : 1;

/** Frozen enemies neither move nor shoot. */
export const enemiesFrozen = (b: ActiveBoons | undefined): boolean => boonActive(b, 'freeze');

/** A shield eats any hit that would cost a heart. */
export const isShielded = (b: ActiveBoons | undefined): boolean => boonActive(b, 'shield');
