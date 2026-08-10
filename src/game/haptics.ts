import * as Haptics from 'expo-haptics';

/**
 * The haptic budget.
 *
 * Every haptic in the game used to go straight at the motor. That was a problem
 * on two fronts, and the feel one is the worse of the two:
 *
 *  - FEEL. A graze fires once per bullet, and the design deliberately rewards
 *    flying INTO dense patterns — so a scattergun wall produced dozens of
 *    actuations a second. A motor already buzzing continuously cannot also
 *    deliver "you just took a hit": the one haptic carrying information the
 *    player must act on was the one they could not feel. Spending the motor on
 *    the least important event is how a game ends up feeling mushy.
 *  - POWER. Each call is a JSI hop plus a physical actuation, and the vibrator
 *    is a real current draw at exactly the moments the CPU is busiest.
 *
 * The audio path already solved this for itself (see the graze and shot
 * throttles in sounds.ts). This is the same idea for touch, plus a priority
 * rule audio does not need: a hit must always be felt, even mid-graze-storm.
 */

/**
 * What a haptic is worth, low to high. The number is the rank — higher always
 * wins — so these are compared, not just switched on.
 */
export const enum HapticWeight {
  /** Fires constantly by design: grazes. Pure texture, first to be dropped. */
  Ambient = 0,
  /** A pickup landed — nice to feel, not urgent. */
  Light = 1,
  /** A meaningful state change: a new gun, a wave bonus. */
  Medium = 2,
  /** Damage, death, a boss phase, an ultimate. Must ALWAYS be felt. */
  Heavy = 3,
}

/**
 * Minimum gap before another haptic of the same weight is allowed, in ms.
 *
 * Ambient is the loosest by a wide margin: it is the one that arrives in
 * floods, and roughly seven ticks a second still reads as continuous texture
 * while leaving the motor free between them.
 */
const MIN_GAP_MS: Record<HapticWeight, number> = {
  [HapticWeight.Ambient]: 140,
  [HapticWeight.Light]: 90,
  [HapticWeight.Medium]: 60,
  [HapticWeight.Heavy]: 0,
};

/**
 * After something important lands, ignore ambient texture for this long.
 *
 * Without it a hit taken inside a graze storm is immediately buried by the next
 * graze tick, and the player feels an undifferentiated buzz instead of "that
 * one mattered". Deliberately longer than the ambient gap — the silence AROUND
 * a heavy haptic is what makes it read as heavy.
 */
const HEAVY_SHADOW_MS = 220;

let lastAt = 0;
let lastHeavyAt = 0;

/** Injectable clock, so the budget is testable without real timers. */
let clock: () => number = () => Date.now();

/** Testing seam — reset the budget and (optionally) drive it from a fake clock. */
export function resetHaptics(now: () => number = () => Date.now()): void {
  clock = now;
  lastAt = 0;
  lastHeavyAt = 0;
}

/**
 * Request a haptic. Returns whether it was actually spent.
 *
 * Fire-and-forget: the promise is swallowed the way every call site already
 * did, because a device with no motor (or one refusing the request) must never
 * be able to throw into the game loop.
 */
export function haptic(
  weight: HapticWeight,
  /**
   * Which generator to use. Independent of the weight on purpose: how a haptic
   * FEELS and how much it matters are different questions. A ship grab is a
   * soft selection tick that must not be rationed away; a graze is the same
   * soft tick that must be.
   */
  style: Haptics.ImpactFeedbackStyle | 'selection' = weight === HapticWeight.Ambient
    ? 'selection'
    : Haptics.ImpactFeedbackStyle.Light
): boolean {
  const now = clock();
  // A heavy haptic is never rationed — it is the whole reason the budget exists.
  if (weight < HapticWeight.Heavy) {
    if (now - lastAt < MIN_GAP_MS[weight]) return false;
    if (weight === HapticWeight.Ambient && now - lastHeavyAt < HEAVY_SHADOW_MS) return false;
  }
  lastAt = now;
  if (weight === HapticWeight.Heavy) lastHeavyAt = now;

  try {
    if (style === 'selection') Haptics.selectionAsync().catch(() => {});
    else Haptics.impactAsync(style).catch(() => {});
  } catch {
    // Never let feedback break the frame.
  }
  return true;
}

/**
 * A failure the player must register — losing a heart, or the run ending.
 *
 * Kept separate because it maps to the notification generator rather than the
 * impact one, and it always spends: this is the single most important thing the
 * motor communicates.
 */
export function hapticFailure(): void {
  lastAt = clock();
  lastHeavyAt = lastAt;
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  } catch {
    // As above.
  }
}
