// The Chain: the run's actual score.
//
// The game previously scored altitude, which is a clock — a player who hid at
// the bottom and never fired scored the same per second as one who cleared every
// wave flawlessly. Nothing you *did* was measured. This replaces that with a
// score built from kills multiplied by a chain you have to actively maintain.
//
// Two mechanics, and the second is the one that matters:
//
//   CHAIN  every kill adds 1 and refreshes a window. Multiplier steps up every
//          5 chain. Letting the window lapse DECAYS a step at a time rather than
//          resetting, so a quiet beat isn't a cliff. Taking a hit drops you to
//          ×1 — not to zero, because losing a heart already hurts and a total
//          wipe on top of it teaches players to play scared.
//
//   GRAZE  passing close to an enemy bullet without being hit refreshes the
//          window and pays energy. This is what makes flying TOWARD danger
//          correct, and it turns the dense bullet patterns the game already has
//          from an annoyance into the main source of score.
//
// Everything here is pure so the balance can be tested without a renderer.

// --- Chain tuning ------------------------------------------------------------

/** Seconds a kill or graze keeps the chain alive. */
export const CHAIN_WINDOW = 2.5;
/** Chain kills per multiplier step. */
export const CHAIN_STEP = 5;
/** Multiplier added per step. */
export const CHAIN_STEP_MULT = 0.5;
/** Hard ceiling on the multiplier (reached at chain 90). */
export const CHAIN_MAX_MULT = 10;
/** Once the window lapses, one step is shed every this many seconds. */
export const CHAIN_DECAY_EVERY = 0.5;
/** Multiplier steps that survive a hit — a hit drops you to ×1, not to nothing. */
export const CHAIN_HIT_FLOOR = 0;

/** Multiplier callouts worth shouting about. */
export const CHAIN_CALLOUTS = [3, 5, 8, 10];

// --- Graze tuning ------------------------------------------------------------

/**
 * Extra reach beyond the player's hitbox that still counts as a graze.
 *
 * Deliberately modest. The player box is already inset 6px on every side for
 * fairness, so this reads as "that nearly hit me" rather than as a passive aura
 * that racks up chain for standing still.
 */
export const GRAZE_PAD = 22;
/** Chain window refresh a graze grants (a fraction of a kill's). */
export const GRAZE_WINDOW_FRAC = 0.8;
/** Score paid per graze, before the multiplier. */
export const GRAZE_VALUE = 2;

// --- Score values ------------------------------------------------------------
// Base value before the chain multiplier. Bosses are worth a lot because they
// are the only target that takes sustained commitment to kill.

export const SCORE_ENEMY = 10;
export const SCORE_ELITE = 40;
export const SCORE_MINI_BOSS = 250;
export const SCORE_GIANT_BOSS = 700;

/** Wave-clear ribbons, paid on top of the wave's kills. */
export const SCORE_FLAWLESS_WAVE = 300;
export const SCORE_FULL_CHAIN_WAVE = 200;
export const SCORE_SPEED_WAVE = 150;
/** Seconds under which a wave clear counts as a SPEED bonus. */
export const WAVE_PAR_SECONDS = 18;

/**
 * Killing higher up the screen pays more — it rewards pushing forward instead
 * of turtling at the bottom. Scales from 1.0 at the player's own altitude to
 * this at the very top.
 */
export const RISK_BONUS_MAX = 1.5;

// --- Chain state -------------------------------------------------------------

export interface ChainState {
  /** Kills (and grazes) currently chained. */
  chain: number;
  /** Seconds left on the window before decay begins. */
  chainT: number;
  /** Seconds accumulated toward shedding the next step, once lapsed. */
  decayT: number;
  /** Highest multiplier reached this run, for the results screen. */
  bestMult: number;
}

export const freshChain = (): ChainState => ({ chain: 0, chainT: 0, decayT: 0, bestMult: 1 });

/** Multiplier for a given chain count. */
export function multiplierFor(chain: number): number {
  if (chain <= 0) return 1;
  const m = 1 + Math.floor(chain / CHAIN_STEP) * CHAIN_STEP_MULT;
  return Math.min(CHAIN_MAX_MULT, m);
}

/** The chain count at which a given multiplier step begins. */
export const chainForMultiplier = (mult: number): number =>
  Math.max(0, Math.round(((mult - 1) / CHAIN_STEP_MULT) * CHAIN_STEP));

/**
 * Advance the chain for one frame.
 *
 * While the window holds, nothing happens. Once it lapses, a full multiplier
 * STEP is shed every CHAIN_DECAY_EVERY seconds — a gradual slide rather than a
 * cliff, so a couple of seconds without a target doesn't erase a long chain.
 *
 * Mutates in place (the loop owns this object) and returns whether the
 * multiplier actually changed, so the caller can decide whether to re-render a
 * readout or play a sting.
 */
export function tickChain(c: ChainState, dt: number): boolean {
  if (c.chain <= 0) return false;
  const before = multiplierFor(c.chain);

  if (c.chainT > 0) {
    c.chainT = Math.max(0, c.chainT - dt);
    if (c.chainT > 0) return false;
    // Just lapsed — start the decay clock fresh rather than shedding instantly.
    c.decayT = 0;
    return false;
  }

  c.decayT += dt;
  while (c.decayT >= CHAIN_DECAY_EVERY && c.chain > 0) {
    c.decayT -= CHAIN_DECAY_EVERY;
    // Shed a whole step, and land ON the step boundary so the multiplier moves
    // by exactly one notch per tick however far into a step the chain sat.
    const steppedDown = Math.max(0, Math.floor((c.chain - 1) / CHAIN_STEP) * CHAIN_STEP);
    c.chain = steppedDown;
  }
  return multiplierFor(c.chain) !== before;
}

/**
 * Register a kill: extends the chain and refreshes the window.
 * Returns the new multiplier so the caller can score the kill with it.
 */
export function addChain(c: ChainState, amount = 1): number {
  c.chain += amount;
  c.chainT = CHAIN_WINDOW;
  c.decayT = 0;
  const m = multiplierFor(c.chain);
  if (m > c.bestMult) c.bestMult = m;
  return m;
}

/**
 * Register a graze: refreshes the window (a little less generously than a kill)
 * without adding to the chain, so grazing sustains a chain but cannot build one
 * on its own — the score still has to come from killing things.
 */
export function grazeChain(c: ChainState): void {
  c.chainT = Math.max(c.chainT, CHAIN_WINDOW * GRAZE_WINDOW_FRAC);
  c.decayT = 0;
}

/**
 * Register a hit: collapse to ×1 but keep the run's best-multiplier record.
 *
 * Not to zero. The player has just lost a heart; wiping the chain as well reads
 * as a double punishment and makes people turtle.
 */
export function breakChain(c: ChainState): void {
  c.chain = CHAIN_HIT_FLOOR;
  c.chainT = 0;
  c.decayT = 0;
}

/** 0..1 fill of the window, for the HUD ring. */
export const chainWindowFrac = (c: ChainState): number =>
  Math.max(0, Math.min(1, c.chainT / CHAIN_WINDOW));

// --- Scoring -----------------------------------------------------------------

/**
 * Score for one kill.
 *
 * `riskFrac` is 0 at the player's own height and 1 at the top of the screen; it
 * scales the payout up to RISK_BONUS_MAX so reaching up the board beats waiting
 * for enemies to come down.
 */
export function killScore(base: number, multiplier: number, riskFrac = 0): number {
  const risk = 1 + Math.max(0, Math.min(1, riskFrac)) * (RISK_BONUS_MAX - 1);
  return Math.round(base * multiplier * risk);
}

/** Which multiplier callout, if any, a step-up from `before` to `after` crosses. */
export function calloutFor(before: number, after: number): number | undefined {
  for (const c of CHAIN_CALLOUTS) {
    if (before < c && after >= c) return c;
  }
  return undefined;
}

// --- Wave-clear ribbons ------------------------------------------------------

export type RibbonKind = 'flawless' | 'fullChain' | 'speed';

export interface Ribbon {
  kind: RibbonKind;
  label: string;
  score: number;
}

export const RIBBON_DEFS: Record<RibbonKind, { label: string; score: number }> = {
  flawless: { label: 'FLAWLESS', score: SCORE_FLAWLESS_WAVE },
  fullChain: { label: 'FULL CHAIN', score: SCORE_FULL_CHAIN_WAVE },
  speed: { label: 'SPEED', score: SCORE_SPEED_WAVE },
};

/**
 * Which ribbons a just-cleared wave earned.
 *
 * `waveHits` was already tracked and until now only fed a lifetime stat; this
 * gives it a payoff the player actually sees.
 */
export function ribbonsFor(opts: {
  waveHits: number;
  chainHeld: boolean;
  waveSeconds: number;
}): Ribbon[] {
  const out: Ribbon[] = [];
  if (opts.waveHits === 0) out.push({ kind: 'flawless', ...RIBBON_DEFS.flawless });
  if (opts.chainHeld) out.push({ kind: 'fullChain', ...RIBBON_DEFS.fullChain });
  if (opts.waveSeconds > 0 && opts.waveSeconds <= WAVE_PAR_SECONDS) {
    out.push({ kind: 'speed', ...RIBBON_DEFS.speed });
  }
  return out;
}

export const ribbonTotal = (ribbons: Ribbon[]): number =>
  ribbons.reduce((sum, r) => sum + r.score, 0);

// --- Graze detection ---------------------------------------------------------

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Whether a bullet is inside the graze band: near the player's box, but not
 * touching it.
 *
 * The "not touching" half matters — a bullet that actually connects is a hit,
 * and paying a graze for it too would reward getting shot.
 */
export function isGrazing(bullet: { x: number; y: number; size: number }, box: Box, pad = GRAZE_PAD): boolean {
  const r = bullet.size / 2;
  const hits =
    bullet.x + r > box.left && bullet.x - r < box.right && bullet.y + r > box.top && bullet.y - r < box.bottom;
  if (hits) return false;
  return (
    bullet.x + r > box.left - pad &&
    bullet.x - r < box.right + pad &&
    bullet.y + r > box.top - pad &&
    bullet.y - r < box.bottom + pad
  );
}
