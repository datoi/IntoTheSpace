// Enemy archetypes and elite modifiers.
//
// The original game had one enemy that held formation and fired an aimed shot.
// This turns "what an enemy does" into data: an archetype names a MOVEMENT
// behaviour and a FIRE behaviour, and the loop dispatches on those instead of
// hard-coding one pattern. Adding an enemy is a catalog entry plus (only if it
// needs a genuinely new motion) one case in `stepEnemy`.
//
// Elites are an orthogonal layer on top: any archetype can roll any modifier,
// which is where the late-game combinations come from — a Rapid Sniper and a
// Shielded Kamikaze are different fights, from two small pieces of data.
//
// Everything here is pure apart from the deliberate in-place mutation of the
// card being stepped (the loop mutates entities by design — see GameScreen).

import type { Card, EnemyBullet } from './types';
import {
  PALETTE,
  SCREEN,
  LANES,
  laneX,
  FEED_PAD,
  OB_HIT,
  ARCH_FIRE_SCALE,
  ENEMY_BULLET_SPEED,
  ENEMY_BULLET_SIZE,
  ENEMY_BULLET_LIFE,
  ENEMY_HOMING_LIFE,
  ENEMY_HOMING_SPEED,
  ENEMY_DESCEND_SPEED,
  WAVE_COLORS,
  CHARGE_SPEED,
  ENEMY_SHOT_FOR_ARCH,
} from './constants';

// --- Behaviour vocabulary ----------------------------------------------------

export type MoveKind =
  | 'hold' // parks in its formation slot (the original behaviour)
  | 'sway' // smooth sine, side to side
  | 'zigzag' // sharp lateral tacking
  | 'strafe' // steady drift across the screen, wrapping at the edges
  | 'dive' // periodically lunges down at the player, then climbs back
  | 'charge' // beelines at the player and never returns
  | 'orbit' // circles its hold point
  | 'blink'; // teleports to a new lane every few seconds

export type FireKind =
  | 'none'
  | 'aimed' // one shot at the player
  | 'burst' // three fast aimed shots
  | 'shotgun' // a wide spread
  | 'spiral' // rotating fan, ignores where the player is
  | 'sniper' // long wind-up, then one fast shot
  | 'missile'; // slow locking rocket

export interface ArchetypeDef {
  id: ArchKind;
  name: string;
  move: MoveKind;
  fire: FireKind;
  /** HP multiplier against the wave's baseline. */
  hp: number;
  /** Hitbox/visual scale against OB_HIT. */
  size: number;
  /** Seconds between this enemy's own shots (before elite modifiers). */
  fireEvery: number;
  /** Relative spawn weight. */
  weight: number;
  /** Never appears before this wave. */
  minWave: number;
  /** Coin value on death, before elite bonuses. */
  bounty: number;
  /**
   * Index into ENEMY_SHIPS. Art is chosen by BEHAVIOUR, not by wave, so a
   * silhouette reliably means a behaviour — a Sniper always looks like a
   * Sniper. Fifteen archetypes previously shared six sprites cycled by wave,
   * which meant the same enemy changed appearance every five waves and two
   * completely different threats looked identical.
   */
  sprite: number;
  /** Player-facing note for the collection screen. */
  desc: string;
}

export type ArchKind =
  | 'grunt'
  | 'scout'
  | 'tank'
  | 'weaver'
  | 'diver'
  | 'kamikaze'
  | 'sniper'
  | 'gunner'
  | 'spiraller'
  | 'strafer'
  | 'blinker'
  | 'sentinel'
  | 'seeker'
  | 'splitter';

export const ARCHETYPES: Record<ArchKind, ArchetypeDef> = {
  grunt: {
    id: 'grunt',
    sprite: 0,
    name: 'Drone',
    move: 'hold',
    fire: 'aimed',
    hp: 1,
    size: 1,
    fireEvery: 3.2,
    weight: 30,
    minWave: 1,
    bounty: 1,
    desc: 'Holds the line and takes aimed shots. The baseline alien.',
  },
  scout: {
    id: 'scout',
    sprite: 1,
    name: 'Scout',
    move: 'sway',
    fire: 'aimed',
    hp: 0.6,
    size: 0.85,
    fireEvery: 2.6,
    weight: 20,
    minWave: 2,
    bounty: 1,
    desc: 'Fragile and quick, never quite where you aimed.',
  },
  tank: {
    id: 'tank',
    sprite: 4,
    name: 'Bulwark',
    move: 'hold',
    fire: 'burst',
    hp: 3.4,
    size: 1.3,
    fireEvery: 4,
    weight: 12,
    minWave: 4,
    bounty: 3,
    desc: 'Slow, heavily armoured, and answers in three-round bursts.',
  },
  weaver: {
    id: 'weaver',
    sprite: 2,
    name: 'Weaver',
    move: 'zigzag',
    fire: 'aimed',
    hp: 0.9,
    size: 0.9,
    fireEvery: 2.8,
    weight: 16,
    minWave: 3,
    bounty: 2,
    desc: 'Tacks hard left and right — a genuinely awkward target.',
  },
  diver: {
    id: 'diver',
    sprite: 2,
    name: 'Dive Bomber',
    move: 'dive',
    fire: 'aimed',
    hp: 1.2,
    size: 1,
    fireEvery: 3.4,
    weight: 13,
    minWave: 5,
    bounty: 2,
    desc: 'Lunges down at you, then pulls back up to its slot.',
  },
  kamikaze: {
    id: 'kamikaze',
    sprite: 1,
    name: 'Kamikaze',
    move: 'charge',
    fire: 'none',
    hp: 0.7,
    size: 0.95,
    fireEvery: 0,
    weight: 11,
    minWave: 6,
    bounty: 2,
    desc: 'Does not shoot. Simply comes for you and does not stop.',
  },
  sniper: {
    id: 'sniper',
    sprite: 6,
    name: 'Sniper',
    move: 'hold',
    fire: 'sniper',
    hp: 1.1,
    size: 0.95,
    fireEvery: 4.2,
    weight: 10,
    minWave: 7,
    bounty: 3,
    desc: 'Telegraphs a long charge, then fires one very fast shot.',
  },
  gunner: {
    id: 'gunner',
    sprite: 5,
    name: 'Scattergun',
    move: 'sway',
    fire: 'shotgun',
    hp: 1.6,
    size: 1.1,
    fireEvery: 4.6,
    weight: 10,
    minWave: 8,
    bounty: 3,
    desc: 'Throws a wide cone of shot you have to move through, not dodge.',
  },
  spiraller: {
    id: 'spiraller',
    sprite: 8,
    name: 'Spinner',
    move: 'hold',
    fire: 'spiral',
    hp: 2,
    size: 1.15,
    fireEvery: 0.42,
    weight: 8,
    minWave: 10,
    bounty: 4,
    desc: 'Sprays a slow rotating fan that fills the board rather than aiming.',
  },
  strafer: {
    id: 'strafer',
    sprite: 3,
    name: 'Strafer',
    move: 'strafe',
    fire: 'aimed',
    hp: 1.1,
    size: 0.95,
    fireEvery: 2.4,
    weight: 11,
    minWave: 9,
    bounty: 2,
    desc: 'Runs laterally across the whole screen, firing as it crosses.',
  },
  blinker: {
    id: 'blinker',
    sprite: 7,
    name: 'Teleporter',
    move: 'blink',
    fire: 'aimed',
    hp: 1.3,
    size: 0.95,
    fireEvery: 2.2,
    weight: 8,
    minWave: 12,
    bounty: 3,
    desc: 'Refuses to stay put — blinks to a new column every few seconds.',
  },
  // The 'orbit' movement and 'missile' fire behaviours were implemented in
  // stepEnemy/enemyFire but referenced by no archetype — two enemies already
  // built and shipping as dead code. These reach them.
  sentinel: {
    id: 'sentinel',
    sprite: 10,
    name: 'Sentinel',
    move: 'orbit',
    fire: 'burst',
    hp: 1.7,
    size: 1.05,
    fireEvery: 3.6,
    weight: 9,
    minWave: 6,
    bounty: 3,
    desc: 'Circles its post in a tight ring, answering in bursts.',
  },
  seeker: {
    id: 'seeker',
    sprite: 11,
    name: 'Seeker',
    move: 'sway',
    fire: 'missile',
    hp: 1.4,
    size: 1,
    fireEvery: 5,
    weight: 8,
    minWave: 13,
    bounty: 4,
    desc: 'Launches slow locking missiles that follow you until they run dry.',
  },
  splitter: {
    id: 'splitter',
    sprite: 4,
    name: 'Splitter',
    move: 'sway',
    fire: 'aimed',
    hp: 2.2,
    size: 1.25,
    fireEvery: 3,
    weight: 8,
    minWave: 11,
    bounty: 3,
    desc: 'Breaks into two smaller drones when destroyed. Kill it twice.',
  },
};

export const ARCH_KINDS = Object.keys(ARCHETYPES) as ArchKind[];

/**
 * The archetype a card is running, with a fallback for one that no longer exists.
 *
 * `Card.arch` is PERSISTED in a run snapshot, so a save written by an older
 * build can name an archetype this build has retired — 'layer' (the Mine Layer)
 * was removed exactly this way. The lookup used to be a bare
 * `ARCHETYPES[card.arch]`, which returns `undefined` for a retired name and then
 * throws on the very next property read, out of the rAF loop, on every resume.
 * Falling back to the grunt keeps the enemy alive as a plain hold-and-shoot
 * drone: harmless, still killable, and the run continues.
 *
 * Every consumer must go through here rather than indexing ARCHETYPES directly,
 * because the roster will change again.
 */
export const archDef = (card: Card): ArchetypeDef =>
  (card.arch && ARCHETYPES[card.arch]) || ARCHETYPES.grunt;

// --- Elite modifiers ---------------------------------------------------------

export type EliteKind =
  | 'armored'
  | 'rapid'
  | 'regen'
  | 'shielded'
  | 'explosive'
  | 'vampiric'
  | 'swift'
  | 'volatile';

export interface EliteDef {
  id: EliteKind;
  name: string;
  /** Aura tint drawn behind the ship, so an elite is spotted instantly. */
  color: string;
  hpMult: number;
  /** Multiplier on the enemy's own fire interval (< 1 = fires more often). */
  fireMult: number;
  /** Multiplier on movement/descent speed. */
  speedMult: number;
  /** Extra coins on death. */
  bonusCoins: number;
  /** Chance this elite also drops a crystal. */
  crystalChance: number;
  desc: string;
  minWave: number;
  weight: number;
}

// Three intensities of the hostile family. Identity comes from the elite's
// NAME, not its hue — see §2b of the visual spec.
const ELITE_TINT = PALETTE.threat;
const ELITE_TINT_HARD = PALETTE.threatDeep;
const ELITE_TINT_ALT = PALETTE.threatAlt;

export const ELITES: Record<EliteKind, EliteDef> = {
  armored: {
    id: 'armored',
    name: 'Armored',
    color: ELITE_TINT_HARD, // armored
    hpMult: 2.4,
    fireMult: 1.15,
    speedMult: 0.85,
    bonusCoins: 2,
    crystalChance: 0.2,
    desc: 'Far more hull than it should have.',
    minWave: 3,
    weight: 18,
  },
  rapid: {
    id: 'rapid',
    name: 'Rapid Fire',
    color: ELITE_TINT, // rapid
    hpMult: 1.3,
    fireMult: 0.4,
    speedMult: 1,
    bonusCoins: 2,
    crystalChance: 0.2,
    desc: 'Cycles its weapon more than twice as fast.',
    minWave: 4,
    weight: 16,
  },
  regen: {
    id: 'regen',
    name: 'Regenerating',
    color: ELITE_TINT_HARD, // regen — was friendly green
    hpMult: 1.5,
    fireMult: 1,
    speedMult: 1,
    bonusCoins: 3,
    crystalChance: 0.25,
    desc: 'Knits itself back together if you stop shooting it.',
    minWave: 6,
    weight: 13,
  },
  shielded: {
    id: 'shielded',
    name: 'Shielded',
    color: ELITE_TINT, // shielded — was the PLAYER's shield colour
    hpMult: 1.2,
    fireMult: 1,
    speedMult: 1,
    bonusCoins: 3,
    crystalChance: 0.3,
    desc: 'Carries a shield pool you must break before the hull takes a scratch.',
    minWave: 7,
    weight: 13,
  },
  explosive: {
    id: 'explosive',
    name: 'Explosive',
    color: ELITE_TINT, // explosive
    hpMult: 1.2,
    fireMult: 1.1,
    speedMult: 1,
    bonusCoins: 3,
    crystalChance: 0.25,
    desc: 'Bursts into a ring of shot when it dies — mind where you are.',
    minWave: 8,
    weight: 12,
  },
  vampiric: {
    id: 'vampiric',
    name: 'Vampiric',
    color: ELITE_TINT_ALT, // vampiric
    hpMult: 1.4,
    fireMult: 0.85,
    speedMult: 1,
    bonusCoins: 3,
    crystalChance: 0.3,
    desc: 'Heals itself every time one of its shots lands on you.',
    minWave: 10,
    weight: 10,
  },
  swift: {
    id: 'swift',
    name: 'Swift',
    color: ELITE_TINT_ALT, // swift — was reward gold
    hpMult: 0.9,
    fireMult: 0.7,
    speedMult: 1.8,
    bonusCoins: 2,
    crystalChance: 0.2,
    desc: 'Moves and reloads at a pace that punishes hesitation.',
    minWave: 5,
    weight: 14,
  },
  volatile: {
    id: 'volatile',
    name: 'Volatile',
    color: ELITE_TINT_ALT, // volatile
    hpMult: 3.2,
    fireMult: 1.2,
    speedMult: 0.9,
    bonusCoins: 6,
    crystalChance: 0.75,
    desc: 'A walking payday, if you can chew through it.',
    minWave: 12,
    weight: 6,
  },
};

export const ELITE_KINDS = Object.keys(ELITES) as EliteKind[];

/**
 * Odds any given spawn is an elite, ramping with wave and then flattening.
 * Capped well under half: elites are meant to be a spike of interest, not the
 * default state of the board.
 */
export function eliteChance(wave: number): number {
  if (wave < 3) return 0;
  return Math.min(0.32, 0.03 + wave * 0.012);
}

// --- Weighted rolls ----------------------------------------------------------

function weightedPick<T>(pool: T[], weightOf: (t: T) => number, rng: () => number): T | undefined {
  if (!pool.length) return undefined;
  let total = 0;
  for (const p of pool) total += weightOf(p);
  if (total <= 0) return pool[0];
  let pick = rng() * total;
  for (const p of pool) {
    pick -= weightOf(p);
    if (pick <= 0) return p;
  }
  return pool[pool.length - 1];
}

/**
 * Which archetype spawns on a given wave.
 *
 * The grunt's weight decays as the player climbs, so early waves read as "the
 * basic alien, occasionally something odd" and deep waves as "anything at all"
 * — without ever hard-cutting the baseline enemy out of the pool.
 */
export function rollArchetype(wave: number, rng: () => number = Math.random): ArchKind {
  const pool = ARCH_KINDS.filter((k) => wave >= ARCHETYPES[k].minWave);
  const weightOf = (k: ArchKind) => {
    const w = ARCHETYPES[k].weight;
    if (k !== 'grunt') return w;
    return Math.max(4, w - wave * 1.4);
  };
  return weightedPick(pool, weightOf, rng) ?? 'grunt';
}

export function rollElite(wave: number, rng: () => number = Math.random): EliteKind | undefined {
  if (rng() >= eliteChance(wave)) return undefined;
  const pool = ELITE_KINDS.filter((k) => wave >= ELITES[k].minWave);
  return weightedPick(pool, (k) => ELITES[k].weight, rng);
}

// --- Applying a spec to a card ----------------------------------------------

/**
 * Baseline HP for a plain enemy on this wave.
 *
 * Raised roughly 40% (from `2 + wave*0.6`) as the other half of the fire-rate
 * cut — see ARCH_FIRE_SCALE. Enemies now shoot less often, so without this they
 * would simply be easier; living longer keeps the pressure while the SPACING of
 * the shots is what changes. That spacing is the whole point: a wall with no gap
 * in it is not a difficulty curve, it is a coin flip.
 */
export const baseWaveHp = (wave: number): number => 3 + Math.floor(wave * 0.85);

/**
 * Stamp an archetype and optional elite onto a freshly made card: HP, hitbox,
 * fire clock and behaviour state. Called at spawn, never per frame.
 */
export function applyArchetype(card: Card, arch: ArchKind, elite: EliteKind | undefined, wave: number): void {
  const def = ARCHETYPES[arch];
  const el = elite ? ELITES[elite] : undefined;

  card.arch = arch;
  card.elite = elite;
  // Art follows behaviour, overriding whatever the wave-based default set.
  card.shipIdx = def.sprite;

  const hp = Math.max(1, Math.round(baseWaveHp(wave) * def.hp * (el?.hpMult ?? 1)));
  card.hp = hp;
  card.maxHp = hp;

  const box = Math.round(OB_HIT * def.size);
  card.h = box;
  card.w = box;

  // Stagger the first shot across a formation so a wave doesn't open with one
  // synchronised volley from every ship at once.
  // ARCH_FIRE_SCALE stretches every archetype's clock by the same factor, so the
  // table above keeps expressing who fires faster than whom while the board as a
  // whole leaves gaps to fly through.
  card.fireEvery = def.fireEvery * ARCH_FIRE_SCALE * (el?.fireMult ?? 1);
  card.fireT = card.fireEvery * (0.35 + Math.random() * 0.9);
  card.speedMult = el?.speedMult ?? 1;
  card.behaveT = Math.random() * Math.PI * 2; // desynchronised behaviour clock

  if (elite === 'shielded') {
    // A separate pool in front of the hull, worth about a third of it.
    card.shieldHp = Math.max(2, Math.round(hp * 0.45));
    card.shieldMax = card.shieldHp;
  }
  if (arch === 'splitter') card.splitsLeft = 2;
}

/** Coins this enemy pays out. */
export function bountyOf(card: Card): number {
  const def = card.arch ? ARCHETYPES[card.arch] : undefined;
  const el = card.elite ? ELITES[card.elite] : undefined;
  return (def?.bounty ?? 1) + (el?.bonusCoins ?? 0);
}

export const eliteColor = (card: Card): string | undefined =>
  card.elite ? ELITES[card.elite].color : undefined;

// --- Per-frame behaviour -----------------------------------------------------

export interface EnemyShotSpec {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: EnemyBullet['kind'];
  size?: number;
  life?: number;
  color?: string;
  shot?: number;
}

export interface EnemyCtx {
  dt: number;
  elapsed: number;
  playerX: number;
  playerY: number;
  wave: number;
  /** World-fall speed, so strafers can match the scene. */
  worldSpeed: number;
  fire: (spec: EnemyShotSpec) => void;
}

const REGEN_PER_SEC = 0.8; // HP/s once it's been left alone
const REGEN_DELAY = 1.6; // s after the last hit before regen kicks in
const DIVE_PERIOD = 3.6; // s between dive lunges
const DIVE_DEPTH = 190; // px a diver drops below its slot
const BLINK_PERIOD = 2.6; // s between teleports
const SWAY_AMP = 0.16; // fraction of screen width
const SWAY_FREQ = 1.5;
const ZIG_LATERAL = 150; // px/s
const ZIG_PERIOD = 1.1; // s per tack
const STRAFE_SPEED = 105; // px/s
const ORBIT_R = 42;
const ORBIT_FREQ = 2.1;
const SNIPER_WINDUP = 1.1; // s of visible charge before the shot
const SNIPER_SPEED = 520;
const SPIRAL_STEP = 0.55; // rad the fan advances per shot

/**
 * Advance one enemy's movement for this frame.
 *
 * Called only for live, non-boss enemies that have finished descending —
 * descent and boss sway stay in GameScreen, which owns those. Returns nothing;
 * the card is mutated in place, matching how the rest of the loop works.
 */
export function stepEnemy(card: Card, ctx: EnemyCtx): void {
  const def = archDef(card);
  const dt = ctx.dt;
  const sp = card.speedMult ?? 1;
  card.behaveT = (card.behaveT ?? 0) + dt;
  const t = card.behaveT;
  const home = card.homeX ?? laneX(card.lane);
  const holdY = card.holdY ?? card.y;

  // Regenerating elites knit back up once you stop shooting them.
  if (card.elite === 'regen' && card.hp < card.maxHp && card.hitT <= 0) {
    card.regenIdle = (card.regenIdle ?? 0) + dt;
    if (card.regenIdle > REGEN_DELAY) {
      card.hp = Math.min(card.maxHp, card.hp + REGEN_PER_SEC * sp * dt);
    }
  } else if (card.hitT > 0) {
    card.regenIdle = 0;
  }

  switch (def.move) {
    case 'hold':
      card.cx = home;
      break;

    case 'sway':
      card.cx = home + Math.sin(t * SWAY_FREQ * sp) * SCREEN.W * SWAY_AMP;
      break;

    case 'zigzag': {
      // A triangular tack rather than a sine: the direction flips hard, which
      // is what makes it read as evasive instead of merely wobbly.
      const phase = (t / ZIG_PERIOD) % 2;
      const dir = phase < 1 ? 1 : -1;
      card.cx = clampX((card.cx ?? home) + dir * ZIG_LATERAL * sp * dt, card.w ?? OB_HIT);
      break;
    }

    case 'strafe': {
      // Picks a direction once, then runs it, bouncing off the play-area edges.
      if (card.dir === undefined) card.dir = Math.random() < 0.5 ? -1 : 1;
      const hw = (card.w ?? OB_HIT) / 2;
      let nx = (card.cx ?? home) + card.dir * STRAFE_SPEED * sp * dt;
      if (nx < FEED_PAD + hw) {
        nx = FEED_PAD + hw;
        card.dir = 1;
      } else if (nx > SCREEN.W - FEED_PAD - hw) {
        nx = SCREEN.W - FEED_PAD - hw;
        card.dir = -1;
      }
      card.cx = nx;
      break;
    }

    case 'dive': {
      // Rest in the slot, then lunge down and climb back — a repeating swoop
      // shaped so the enemy is only briefly in the player's lane.
      const phase = (t % DIVE_PERIOD) / DIVE_PERIOD;
      // 0 at rest, 1 at the bottom of the lunge, back to 0 — a smooth there
      // and back, so the climb costs the same time as the drop.
      const swoop = phase < 0.5 ? Math.sin(phase * Math.PI) : Math.sin((1 - phase) * Math.PI);
      card.y = holdY + swoop * DIVE_DEPTH * sp;
      card.cx = home + Math.sin(t * 2.2) * 26;
      break;
    }

    case 'charge': {
      // Straight at the player, and it does not give up. This is the one
      // behaviour that abandons the formation slot entirely.
      const curX = card.cx ?? home;
      const dx = ctx.playerX - curX;
      const dy = ctx.playerY - (card.y + (card.h ?? OB_HIT) / 2);
      const d = Math.hypot(dx, dy) || 1;
      const v = CHARGE_SPEED * sp;
      card.cx = curX + (dx / d) * v * dt;
      card.y += (dy / d) * v * dt;
      break;
    }

    case 'orbit':
      card.cx = home + Math.cos(t * ORBIT_FREQ * sp) * ORBIT_R;
      card.y = holdY + Math.sin(t * ORBIT_FREQ * sp) * ORBIT_R;
      break;

    case 'blink': {
      // Sits still, then jumps. `blinkT` counts toward the next jump so the
      // teleport is periodic rather than a per-frame coin flip.
      card.blinkT = (card.blinkT ?? BLINK_PERIOD) - dt * sp;
      if (card.blinkT <= 0) {
        card.blinkT = BLINK_PERIOD;
        const lane = Math.floor(Math.random() * LANES);
        card.homeX = laneX(lane);
        card.lane = lane;
        card.cx = card.homeX;
        card.blinkFlash = 0.22; // render cue so the jump is legible
      }
      if (card.blinkFlash) card.blinkFlash = Math.max(0, card.blinkFlash - dt);
      card.cx = card.homeX ?? home;
      break;
    }
  }

  // Keep everything but a committed charger inside the play area.
  if (def.move !== 'charge') {
    card.cx = clampX(card.cx ?? home, card.w ?? OB_HIT);
  }
}

function clampX(x: number, boxW: number): number {
  const hw = boxW / 2;
  return Math.max(FEED_PAD + hw, Math.min(SCREEN.W - FEED_PAD - hw, x));
}

/**
 * Run one enemy's own weapon clock, emitting shots through `ctx.fire`.
 *
 * This is per-enemy fire, which is what makes archetypes feel distinct. It
 * runs alongside the game's existing global volley timer rather than replacing
 * it — the volley keeps the board's overall pressure on a curve the wave
 * scaling controls, and this adds each ship's own character on top.
 */
export function enemyFire(card: Card, ctx: EnemyCtx): void {
  const def = archDef(card);
  if (def.fire === 'none' || !card.fireEvery) return;

  card.fireT = (card.fireT ?? card.fireEvery) - ctx.dt;
  if ((card.fireT ?? 0) > 0) return;
  card.fireT = card.fireEvery * (0.85 + Math.random() * 0.3);

  const ox = card.cx ?? laneX(card.lane);
  const oy = card.y + (card.h ?? OB_HIT);
  const color = WAVE_COLORS[(ctx.wave - 1 + WAVE_COLORS.length) % WAVE_COLORS.length];
  // The bullet's art is the SHOOTER's, resolved once here rather than looked up
  // per frame in the render.
  const shot = ENEMY_SHOT_FOR_ARCH[def.id];
  const aim = Math.atan2(ctx.playerY - oy, ctx.playerX - ox);

  const shoot = (angle: number, speed: number, extra?: Partial<EnemyShotSpec>) =>
    ctx.fire({
      x: ox,
      y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      kind: 'straight',
      color,
      shot,
      ...extra,
    });

  switch (def.fire) {
    case 'aimed':
      shoot(aim, ENEMY_BULLET_SPEED);
      break;

    case 'burst':
      // Three rounds down the same line, spaced by giving the later two a
      // head start in speed rather than scheduling timers — cheaper, and it
      // reads as a burst because they arrive in sequence.
      for (let i = 0; i < 3; i++) {
        shoot(aim, ENEMY_BULLET_SPEED * (1 + i * 0.22));
      }
      break;

    case 'shotgun': {
      const n = 5;
      const spread = 0.62;
      for (let i = 0; i < n; i++) {
        const a = aim + (i / (n - 1) - 0.5) * spread;
        shoot(a, ENEMY_BULLET_SPEED * 0.92, { size: ENEMY_BULLET_SIZE * 0.85 });
      }
      break;
    }

    case 'spiral': {
      // Ignores the player entirely: a rotating arm that fills space. Two
      // opposed arms so the pattern is symmetric and readable.
      card.spiralA = (card.spiralA ?? 0) + SPIRAL_STEP;
      for (const arm of [0, Math.PI]) {
        shoot(card.spiralA + arm, ENEMY_BULLET_SPEED * 0.78, { size: ENEMY_BULLET_SIZE * 0.9 });
      }
      break;
    }

    case 'sniper':
      // Charge, THEN fire. The wind-up is stored on the card so the render can
      // telegraph it — an un-telegraphed fast shot is just unfair.
      if (!card.windup) {
        card.windup = SNIPER_WINDUP;
        card.fireT = SNIPER_WINDUP; // come back when the charge is done
      } else {
        card.windup = 0;
        shoot(aim, SNIPER_SPEED, { size: ENEMY_BULLET_SIZE * 1.15 });
      }
      break;

    case 'missile':
      ctx.fire({
        x: ox,
        y: oy,
        vx: Math.cos(aim) * ENEMY_HOMING_SPEED,
        vy: Math.sin(aim) * ENEMY_HOMING_SPEED,
        kind: 'homing',
        color,
        shot,
        life: ENEMY_HOMING_LIFE,
      });
      break;
  }
}

// --- Death effects -----------------------------------------------------------

/** The ring of shot an explosive elite leaves behind. */
export function explosiveBurst(card: Card, wave: number, fire: (s: EnemyShotSpec) => void): void {
  const n = 10;
  const ox = card.cx ?? laneX(card.lane);
  const oy = card.y + (card.h ?? OB_HIT) / 2;
  const color = WAVE_COLORS[(wave - 1 + WAVE_COLORS.length) % WAVE_COLORS.length];
  // The ring is the dying enemy's own shot, so a corpse's parting gift is still
  // attributable to what killed you.
  const shot = ENEMY_SHOT_FOR_ARCH[card.arch ?? 'grunt'];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    fire({
      x: ox,
      y: oy,
      vx: Math.cos(a) * ENEMY_BULLET_SPEED * 0.8,
      vy: Math.sin(a) * ENEMY_BULLET_SPEED * 0.8,
      kind: 'straight',
      color,
      size: ENEMY_BULLET_SIZE * 0.9,
      shot,
    });
  }
}

/** Whether this death should spawn splitter children, and how they look. */
export function splitChildren(card: Card, wave: number): { lane: number; cx: number; y: number; hp: number }[] {
  if (card.arch !== 'splitter' || !card.splitsLeft) return [];
  const ox = card.cx ?? laneX(card.lane);
  const oy = card.y;
  const hp = Math.max(1, Math.round(baseWaveHp(wave) * 0.7));
  return [-1, 1].map((side) => ({
    lane: card.lane,
    cx: clampX(ox + side * 30, OB_HIT * 0.8),
    y: oy,
    hp,
  }));
}

/** Descent speed for a card, honouring a Swift elite. */
export const descendSpeed = (card: Card): number => ENEMY_DESCEND_SPEED * (card.speedMult ?? 1);
