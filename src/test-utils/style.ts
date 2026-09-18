// Test-only style helpers.
//
// Everything on the play field is placed with `transform: translate` rather than
// `left`/`top`, because left/top are layout props and every entity moves every
// frame (see the transform note at the top of GameScreen.tsx). Tests still want
// to ask "where is this on screen", so these resolve an element's effective
// position from the layout box AND whatever translation was applied on top of
// it — which keeps the assertions about position rather than about the
// mechanism that produced it.

type Flat = Record<string, any> | undefined;

/**
 * Resolve a style value that may be a plain number OR an `Animated.Value`.
 *
 * Some entities are positioned natively now: rather than re-rendering sixty
 * times a second to move, they hold an `Animated.Value` the game loop writes
 * with `setValue()` (the energy shells do this; the parallax always has). The
 * value in the transform is then a node, not a number, and adding it to a
 * layout offset yields NaN.
 *
 * `__getValue()` is how an Animated node reports where it currently is. Reading
 * it keeps these helpers asking the same question they always asked — "where is
 * this on screen" — rather than making the tests care which mechanism put it
 * there, which is the entire point of this module.
 */
const num = (v: unknown): number => {
  if (typeof v === 'number') return v;
  const get = (v as { __getValue?: () => number } | null)?.__getValue;
  return typeof get === 'function' ? get.call(v) : 0;
};

const translate = (style: Flat, axis: 'translateX' | 'translateY'): number => {
  const t = style?.transform;
  if (!Array.isArray(t)) return 0;
  const entry = t.find((e: unknown) => e !== null && typeof e === 'object' && axis in (e as object));
  return entry ? num((entry as Record<string, unknown>)[axis]) : 0;
};

/** Effective left edge: the layout box plus any translation applied to it. */
export const leftOf = (style: Flat): number => num(style?.left ?? 0) + translate(style, 'translateX');

/** Effective top edge. */
export const topOf = (style: Flat): number => num(style?.top ?? 0) + translate(style, 'translateY');
