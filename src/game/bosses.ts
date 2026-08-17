// Boss fights: phases, movement and attack patterns.
//
// --- Why this module exists --------------------------------------------------
//
// A boss used to be a card with a big HP number that swayed side to side and
// contributed a 2- or 3-shot aimed fan to the GLOBAL enemy volley. That had
// three consequences, and all three are why the fight read as flat:
//
//   1. It fired on the same clock as every drone on the board, so its attacks
//      had no rhythm of their own — the "boss attack" was indistinguishable
//      from the wave's background pressure.
//   2. Its behaviour never changed. The last 10% of the fight played exactly
//      like the first 10%, so a long fight was just a longer version of the
//      same fight.
//   3. `BossBar` has ALWAYS drawn "PHASE 1/2/3" blocks for the giant. The UI
//      promised an escalation the simulation never delivered.
//
// So bosses now own a weapon clock (`card.fireT`) and a phase, and each phase
// swaps both the attack pattern and how the boss moves.
//
// --- The design rule the patterns follow -------------------------------------
//
// Every phase must ask the player for a DIFFERENT VERB. Swapping bullet colours
// or firing more of the same shot is not a new phase — it is the same dodge at
// a higher rate, which is why "stronger" bosses so often just feel spongier.
// The verbs used here are:
//
//   position — `wall`: a curtain with one gap. You must be somewhere specific
//              before it arrives. Tests reading the board ahead of time.
//   commit   — `aimedwall`: the same curtain, but the gap opens where you are
//              NOT. Standing still stops being survivable at all; the phase
//              costs a deliberate run across the arena every time it fires.
//   orbit    — `spiral`/`rake`: a rotating or sweeping pattern that never aims
//              at you. Tests continuous movement; standing still is death.
//   predict  — `twin`: two counter-rotating wheels whose safe channels open and
//              close as they cross. Tests reading where a gap is GOING.
//   react    — `lash`: a tacking zigzag spread with gaps that wander as they
//              fall. The one pattern you cannot solve in advance.
//   time     — `burst`: a telegraphed heavy salvo aimed exactly at you. Tests
//              one committed dodge at the right moment. Standing still is fine
//              until the instant it isn't.
//
// --- Why the fights are LONG, and why that is not a slog ---------------------
//
// Boss health is deliberately large (see BOSS_MINI_HP / BOSS_GIANT_HP). Length
// alone is what turns a boss into a chore, so it is bought back by subdivision:
// a mini runs 3 phases and a giant runs 5, and every phase changes the attack
// AND the movement. The player is never doing the same thing for more than a
// fifth of the bar, and each transition is announced with hit-stop, a callout
// and a haptic, so the length reads as an escalating fight with checkpoints
// rather than as one long health bar.
//
// The chain system does the rest of the work: over a multi-minute fight a chain
// would decay to nothing on kills alone, because a boss is a single kill. It
// survives on GRAZES — which these dense patterns supply constantly. So the
// correct way to fight a boss is to stay near its fire, which is exactly the
// behaviour that makes a long fight tense instead of attritional.
//
// --- Fairness ----------------------------------------------------------------
//
// Nothing here is undodgeable, and that is deliberate rather than generous:
// the graze system pays score, energy AND a chain refresh for near-misses, so
// dense boss patterns are something the player should want to fly toward. A
// pattern with no safe line through it would invert that.
//
//   - `wall` always leaves a gap, travels slower than a normal shot, and the
//     gap never sits under the screen edge where the hull can't reach it.
//   - `burst` always telegraphs through `card.windup`, which Obstacle draws as
//     a ring that tightens onto the hull as the shot comes due — the same tell
//     the Sniper archetype uses, so the player has been taught to read it since
//     wave 8.
//
//     This was WRONG when first written, and the way it was wrong is worth
//     keeping: Obstacle's boss branch returns early, and the ring lived only in
//     the non-boss tree below that return. So the simulation set `windup`
//     faithfully, this comment asserted the fight was fair because of it, and
//     nothing was drawn. The unit tests all passed — they asserted `card.windup`
//     was SET, never that anything rendered. A telegraph is a claim about what
//     the player can SEE, so testing the state behind it proves nothing.
//   - `spiral` skips arms that would fly steeply upward. They'd be invisible
//     to the player within a frame and would burn slots against
//     MAX_ENEMY_BULLETS that the downward arms need.

import type { Card } from './types';
import type { EnemyCtx, EnemyShotSpec } from './enemies';
import {
  SCREEN,
  OB_HIT,
  FEED_PAD,
  BOSS_SWAY_AMP,
  BOSS_SWAY_AMP_LERP,
  BOSS_SWAY_FREQ,
  BOSS_MINI_VIS,
  BOSS_GIANT_VIS,
  BOSS_SHOT,
  ENEMY_BULLET_SPEED,
  ENEMY_BULLET_SIZE,
  ENEMY_BULLET_LIFE,
  WAVE_COLORS,
} from './constants';

export type BossKind = 'mini' | 'giant';

export type BossAttack =
  | 'fan' // aimed spread — the baseline, and the only one a fresh player meets
  | 'rake' // a searchlight sweep that crosses the arena
  | 'lash' // an erratic zigzag spread that tacks as it falls
  | 'wall' // a curtain of shots with exactly one gap
  | 'aimedwall' // a curtain whose gap is placed AWAY from where you're standing
  | 'spiral' // a rotating pinwheel that ignores where the player is
  | 'twin' // two counter-rotating pinwheels that weave a moving lattice
  | 'burst'; // telegraphed wind-up, then a tight fast salvo

export interface BossPhaseDef {
  attack: BossAttack;
  /** Seconds between volleys. */
  every: number;
  /** Sway width, as a multiple of BOSS_SWAY_AMP. */
  swayMult: number;
  /** Sway speed, as a multiple of BOSS_SWAY_FREQ. */
  freqMult: number;
}

/**
 * Phases in the order they are entered — index 0 is full health.
 *
 * The two bosses deliberately do NOT share a repertoire. A giant that played
 * like the mini with more HP would make half the boss content redundant, which
 * is the exact failure the rework exists to fix.
 *
 * Mini — an interceptor. Everything it does is pointed AT you, and it is over
 * quickly, so it gets two phases: shoot, then sweep.
 *
 * Giant — a capital ship. It controls space rather than chasing you, and it
 * lives long enough to run the full position → orbit → time arc.
 */
export const BOSS_PHASES: Record<BossKind, readonly BossPhaseDef[]> = {
  mini: [
    { attack: 'fan', every: 1.4, swayMult: 1, freqMult: 1 },
    { attack: 'rake', every: 1.0, swayMult: 1.2, freqMult: 1.4 },
    { attack: 'lash', every: 0.85, swayMult: 1.35, freqMult: 1.8 },
  ],
  giant: [
    { attack: 'wall', every: 2.3, swayMult: 0.85, freqMult: 0.8 },
    { attack: 'spiral', every: 0.45, swayMult: 1.05, freqMult: 1.1 },
    { attack: 'aimedwall', every: 1.9, swayMult: 1.15, freqMult: 1.3 },
    { attack: 'twin', every: 0.6, swayMult: 1.25, freqMult: 1.5 },
    { attack: 'burst', every: 1.6, swayMult: 1.4, freqMult: 1.9 },
  ],
} as const;

export const bossPhaseCount = (kind: BossKind): number => BOSS_PHASES[kind].length;

/**
 * Which phase this boss is in, 0-based, derived purely from its health.
 *
 * Deriving rather than storing means a resumed save lands in the right phase
 * with no migration, and the boss can never get stuck in a phase its health
 * has already left.
 *
 * The banding matches what `BossBar` draws, so "PHASE 2" on the HUD and phase
 * index 1 here are always the same moment.
 */
export function bossPhaseIndex(card: Card): number {
  const kind = card.boss;
  if (!kind) return 0;
  const n = bossPhaseCount(kind);
  const frac = Math.max(0, Math.min(1, card.hp / Math.max(1, card.maxHp)));
  // frac === 1 must give phase 0, and frac just above 0 must give the last one.
  return Math.max(0, Math.min(n - 1, Math.floor((1 - frac) * n)));
}

export function bossPhase(card: Card): BossPhaseDef {
  const kind = card.boss ?? 'mini';
  return BOSS_PHASES[kind][bossPhaseIndex(card)];
}

/**
 * Advance a boss's sway and return its horizontal centre for this frame.
 *
 * STEPS the card rather than reading a clock, and that is the whole point. Both
 * numbers the phase table scales are made continuous across a transition:
 *
 *   speed — the sine's phase is INTEGRATED (`swayPhase += dt × rate`), so a new
 *           `freqMult` changes where the phase goes next instead of instantly
 *           relocating where it already is. The previous version multiplied
 *           absolute elapsed time by `freqMult` inside sin(), so crossing a band
 *           jumped the argument by `t × Δmult` — several radians deep into a
 *           fight, which lands the boss at an unrelated point. Measured at up to
 *           79% of screen width on a giant's last transition, and it got worse
 *           the longer the fight ran.
 *   width — eased toward the phase's target, because amplitude multiplies the
 *           sine directly and stepping it would still pop by ~34px at the arc's
 *           extremes.
 *
 * Mirrors `bossFire`: mutates in place, matching how the rest of the loop works.
 */
export function bossSway(card: Card, dt: number): number {
  const ph = bossPhase(card);
  card.swayPhase = (card.swayPhase ?? 0) + dt * BOSS_SWAY_FREQ * ph.freqMult;
  // Seeded from the CURRENT phase, so a boss opens at its own width rather than
  // easing up from nothing on its first frame.
  const amp = card.swayAmp ?? ph.swayMult;
  card.swayAmp = amp + (ph.swayMult - amp) * Math.min(1, BOSS_SWAY_AMP_LERP * dt);
  return SCREEN.W / 2 + Math.sin(card.swayPhase) * bossSwayReach(card.boss ?? 'mini', card.swayAmp);
}

/** Rendered width of each boss, so the sway can be bounded by what is DRAWN. */
const BOSS_VIS: Record<BossKind, number> = { mini: BOSS_MINI_VIS, giant: BOSS_GIANT_VIS };

/**
 * How far a boss may swing either side of centre, in px.
 *
 * The phase says how wide it WANTS to sway; the screen decides what it gets. A
 * giant is 168px across and its widest phase asks for 0.42 × screen width,
 * which hung ~53px of the sprite off the edge on a narrow phone — the boss
 * visibly left the play area at the exact moment the fight was hardest.
 *
 * Capping the AMPLITUDE rather than clamping the output position is the point.
 * A clamped sine FLATTENS: the boss would sit motionless against the edge for a
 * stretch of every cycle and read as stuck on a wall, and its velocity would
 * jump to zero and back. Narrowing the arc keeps the motion a true sine — it
 * simply sweeps as wide as the screen can hold.
 *
 * Measured against the RENDERED size, not the hitbox, because this is about
 * what the player can see; the hitbox is smaller, so it comes along for free.
 */
export const bossSwayReach = (kind: BossKind, swayMult: number): number => {
  const room = Math.max(0, SCREEN.W / 2 - FEED_PAD - BOSS_VIS[kind] / 2);
  return Math.min(SCREEN.W * BOSS_SWAY_AMP * swayMult, room);
};

// --- Pattern tuning ----------------------------------------------------------
// Local to this module, matching how enemies.ts keeps its behaviour numbers
// beside the behaviour they describe.

const FAN_MINI = 3; // shots in a mini's aimed fan
const FAN_GIANT = 5;
const FAN_SPREAD = 0.3; // rad between adjacent fan shots

const RAKE_SHOTS = 3; // shots per sweep step — a cluster, so the beam has width
const RAKE_TIGHT = 0.13; // rad between the shots within one step
const RAKE_ARC = 0.95; // rad the sweep travels either side of straight down
const RAKE_STEP = 0.42; // rad the sweep advances per volley

const LASH_SHOTS = 5; // shots in an erratic spread
const LASH_SPREAD = 0.34; // rad between them at launch
const LASH_SPEED = 0.8; // slower than a fan: the tacking needs room to read

const WALL_COLUMNS = 9; // curtain resolution across the screen
const WALL_SPEED = 0.72; // × ENEMY_BULLET_SPEED — slow, so the gap is readable
const WALL_EDGE_GAP_BIAS = 1; // never put the gap in the outermost column
/**
 * How far an `aimedwall` puts its gap from the player's own column.
 *
 * A minimum, not a maximum, and deliberately not "as far as possible": the gap
 * has to be a journey, but a curtain that always ran to the opposite edge would
 * be both predictable AND occasionally unreachable. 2–4 columns is far enough
 * that standing still never works and close enough that moving always does.
 */
const AIMED_GAP_MIN = 2;
const AIMED_GAP_MAX = 4;

const TWIN_MUZZLE = 0.34; // muzzle offset either side of centre, × sprite width
const TWIN_ARMS = 3;
const TWIN_STEP = 0.3; // rad each pinwheel advances per volley
const TWIN_SPEED = 0.8;

const SPIRAL_ARMS = 4;
const SPIRAL_STEP = 0.38; // rad the pinwheel advances per volley
const SPIRAL_SPEED = 0.85;
const SPIRAL_UP_CUTOFF = -0.35; // skip arms steeper than this upward (sin of angle)

const BURST_SHOTS = 7;
const BURST_SPREAD = 0.16; // rad — tight, so it reads as one hammer blow
const BURST_SPEED = 1.35;
export const BOSS_WINDUP = 0.75; // s of telegraph before a burst lands

const BOSS_BULLET_SIZE = ENEMY_BULLET_SIZE * 1.3;

/** Straight down in screen space, where +y is downward. */
const DOWN = Math.PI / 2;

interface Muzzle {
  ox: number;
  oy: number;
  color: string;
}

const muzzleOf = (card: Card, ctx: EnemyCtx): Muzzle => ({
  ox: card.cx ?? SCREEN.W / 2,
  oy: card.y + (card.h ?? OB_HIT),
  color: WAVE_COLORS[(ctx.wave - 1 + WAVE_COLORS.length) % WAVE_COLORS.length],
});

/** Emit one shot on a heading. Shared by every pattern so they can't drift apart. */
function shoot(
  m: Muzzle,
  ctx: EnemyCtx,
  angle: number,
  speedMult: number,
  x = m.ox,
  y = m.oy,
  kind: EnemyShotSpec['kind'] = 'straight'
): void {
  ctx.fire({
    x,
    y,
    vx: Math.cos(angle) * ENEMY_BULLET_SPEED * speedMult,
    vy: Math.sin(angle) * ENEMY_BULLET_SPEED * speedMult,
    kind,
    color: m.color,
    size: BOSS_BULLET_SIZE,
    life: ENEMY_BULLET_LIFE,
    shot: BOSS_SHOT,
  });
}

/** Angle from the boss's muzzle to the player's centre. */
const aimAt = (m: Muzzle, ctx: EnemyCtx): number =>
  Math.atan2(ctx.playerY - m.oy, ctx.playerX - m.ox);

function fireFan(card: Card, ctx: EnemyCtx, kind: BossKind): void {
  const m = muzzleOf(card, ctx);
  const base = aimAt(m, ctx);
  const n = kind === 'giant' ? FAN_GIANT : FAN_MINI;
  for (let k = 0; k < n; k++) {
    shoot(m, ctx, base + (k - (n - 1) / 2) * FAN_SPREAD, 1);
  }
}

function fireRake(card: Card, ctx: EnemyCtx): void {
  const m = muzzleOf(card, ctx);
  // `spiralA` is the shared rotating-pattern accumulator. It already exists on
  // Card for the Spinner archetype and no boss ever used it, so the sweep needs
  // no new persisted field.
  card.spiralA = (card.spiralA ?? 0) + RAKE_STEP;
  const centre = DOWN + Math.sin(card.spiralA) * RAKE_ARC;
  for (let k = 0; k < RAKE_SHOTS; k++) {
    shoot(m, ctx, centre + (k - (RAKE_SHOTS - 1) / 2) * RAKE_TIGHT, 1);
  }
}

/** Lowest and highest column the gap is ever allowed to sit in. */
const GAP_LO = WALL_EDGE_GAP_BIAS;
const GAP_HI = WALL_COLUMNS - 1 - WALL_EDGE_GAP_BIAS;
const clampGap = (col: number): number => Math.max(GAP_LO, Math.min(GAP_HI, col));

/** Fire a curtain across the screen with a hole at `gap`. */
function wallWithGap(m: Muzzle, ctx: EnemyCtx, gap: number): void {
  const colW = SCREEN.W / WALL_COLUMNS;
  for (let i = 0; i < WALL_COLUMNS; i++) {
    if (i === gap) continue;
    shoot(m, ctx, DOWN, WALL_SPEED, (i + 0.5) * colW, m.oy);
  }
}

function fireWall(card: Card, ctx: EnemyCtx): void {
  // Keep the gap off the outermost columns: a gap hard against an edge forces
  // the player into the corner the hull is least able to manoeuvre out of.
  const span = GAP_HI - GAP_LO + 1;
  wallWithGap(muzzleOf(card, ctx), ctx, GAP_LO + Math.floor(Math.random() * span));
}

/**
 * A curtain that opens somewhere the player is NOT.
 *
 * The plain `wall` can be survived by standing still and getting lucky, which
 * makes a long fight a coin-flip rather than a test. This one reads the player's
 * column and puts the hole a deliberate distance away, so the phase always costs
 * a committed move across the arena. Direction is chosen toward the side with
 * more room, so the gap can never be pushed off the edge of the board.
 */
function fireAimedWall(card: Card, ctx: EnemyCtx): void {
  const colW = SCREEN.W / WALL_COLUMNS;
  const playerCol = Math.floor(ctx.playerX / colW);
  const dist = AIMED_GAP_MIN + Math.floor(Math.random() * (AIMED_GAP_MAX - AIMED_GAP_MIN + 1));
  // Away from whichever edge is closer, so `dist` is always actually available.
  const dir = playerCol > WALL_COLUMNS / 2 ? -1 : 1;
  wallWithGap(muzzleOf(card, ctx), ctx, clampGap(playerCol + dir * dist));
}

/**
 * An erratic spread of tacking shots.
 *
 * Uses the existing zigzag bullet physics, which sway a shot's POSITION
 * perpendicular to its heading. Each shot gets its own random phase at spawn,
 * so the spread frays as it falls instead of advancing as a rigid line — the
 * gaps are real but they move, which is a different read from any of the
 * geometric patterns and is why this closes out the mini rather than a fan.
 */
function fireLash(card: Card, ctx: EnemyCtx): void {
  const m = muzzleOf(card, ctx);
  const base = aimAt(m, ctx);
  for (let k = 0; k < LASH_SHOTS; k++) {
    shoot(m, ctx, base + (k - (LASH_SHOTS - 1) / 2) * LASH_SPREAD, LASH_SPEED, m.ox, m.oy, 'zigzag');
  }
}

/**
 * Two counter-rotating pinwheels, one from each shoulder.
 *
 * The interference between them is the point: two spirals turning opposite ways
 * weave a lattice whose safe channels open and close as they cross, so the
 * player has to read where a gap is GOING rather than where it is. Counter-
 * rotation costs nothing to track — the second wheel simply negates the first
 * wheel's angle, so one accumulator drives both.
 */
function fireTwin(card: Card, ctx: EnemyCtx): void {
  const m = muzzleOf(card, ctx);
  card.spiralA = (card.spiralA ?? 0) + TWIN_STEP;
  const offset = (card.w ?? OB_HIT) * TWIN_MUZZLE;
  for (const side of [-1, 1]) {
    for (let k = 0; k < TWIN_ARMS; k++) {
      // `side` flips the spin as well as the muzzle, which is what makes the
      // two wheels cross rather than travel together.
      const a = side * card.spiralA + (k / TWIN_ARMS) * Math.PI * 2;
      if (Math.sin(a) < SPIRAL_UP_CUTOFF) continue;
      shoot(m, ctx, a, TWIN_SPEED, m.ox + side * offset, m.oy);
    }
  }
}

function fireSpiral(card: Card, ctx: EnemyCtx): void {
  const m = muzzleOf(card, ctx);
  card.spiralA = (card.spiralA ?? 0) + SPIRAL_STEP;
  for (let k = 0; k < SPIRAL_ARMS; k++) {
    const a = card.spiralA + (k / SPIRAL_ARMS) * Math.PI * 2;
    // An arm heading steeply upward leaves the screen before the player could
    // ever interact with it, so it is pure cost against the projectile ceiling.
    if (Math.sin(a) < SPIRAL_UP_CUTOFF) continue;
    shoot(m, ctx, a, SPIRAL_SPEED);
  }
}

function fireBurst(card: Card, ctx: EnemyCtx): void {
  const m = muzzleOf(card, ctx);
  const base = aimAt(m, ctx);
  for (let k = 0; k < BURST_SHOTS; k++) {
    shoot(m, ctx, base + (k - (BURST_SHOTS - 1) / 2) * BURST_SPREAD, BURST_SPEED);
  }
}

/**
 * Advance a boss's own weapon clock and fire its current phase's pattern.
 *
 * Mirrors `enemyFire`: the card is mutated in place and shots leave through
 * `ctx.fire`, so the caller keeps ownership of the projectile ceiling.
 */
export function bossFire(card: Card, ctx: EnemyCtx): void {
  const kind = card.boss;
  if (!kind) return;
  const ph = bossPhase(card);

  // A telegraph already in flight owns the clock until it resolves. Checked
  // first so a phase change mid-wind-up still delivers the salvo the ring
  // promised — the tell must never be a lie, even when the rules change under it.
  if ((card.windup ?? 0) > 0) {
    card.windup = Math.max(0, (card.windup ?? 0) - ctx.dt);
    if ((card.windup ?? 0) > 0) return;
    fireBurst(card, ctx);
    card.fireT = ph.every;
    return;
  }

  card.fireT = (card.fireT ?? ph.every) - ctx.dt;
  if ((card.fireT ?? 0) > 0) return;

  if (ph.attack === 'burst') {
    // Start the tell instead of firing. `fireT` is left expired; the branch
    // above takes over from here.
    card.windup = BOSS_WINDUP;
    return;
  }

  card.fireT = ph.every;
  switch (ph.attack) {
    case 'fan':
      fireFan(card, ctx, kind);
      break;
    case 'rake':
      fireRake(card, ctx);
      break;
    case 'lash':
      fireLash(card, ctx);
      break;
    case 'wall':
      fireWall(card, ctx);
      break;
    case 'aimedwall':
      fireAimedWall(card, ctx);
      break;
    case 'spiral':
      fireSpiral(card, ctx);
      break;
    case 'twin':
      fireTwin(card, ctx);
      break;
  }
}
