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

const translate = (style: Flat, axis: 'translateX' | 'translateY'): number => {
  const t = style?.transform;
  if (!Array.isArray(t)) return 0;
  const entry = t.find((e: unknown) => e !== null && typeof e === 'object' && axis in (e as object));
  return entry ? (entry as Record<string, number>)[axis] : 0;
};

/** Effective left edge: the layout box plus any translation applied to it. */
export const leftOf = (style: Flat): number => (style?.left ?? 0) + translate(style, 'translateX');

/** Effective top edge. */
export const topOf = (style: Flat): number => (style?.top ?? 0) + translate(style, 'translateY');
