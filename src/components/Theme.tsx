// The chrome context: one hue for the whole shell, taken from the equipped sky.
//
// Screens keep declaring their styles once at module scope, exactly as before —
// they just declare them as a function OF the chrome instead of closing over
// PALETTE directly:
//
//   const makeStyles = (c: Chrome) => StyleSheet.create({ card: { ... } });
//   ...
//   const styles = useThemedStyles(makeStyles);
//
// WHY NOT INLINE OVERRIDES
//
// The obvious alternative is `style={[styles.card, { borderColor: c.edge }]}`,
// which allocates an array and an object per element per render and gives up
// StyleSheet's registration. This keeps a real StyleSheet per theme and builds
// each one at most once, because `chromeFor` hands back the SAME object for a
// given background every time — so the cache below can key on identity and the
// factory runs three or four times over the app's whole life, not per render.

import React, { createContext, useContext, useMemo } from 'react';
import { Chrome, chromeFor, DEFAULT_CHROME } from '../game/theme';

const ChromeCtx = createContext<Chrome>(DEFAULT_CHROME);

/**
 * Wraps the shell. `backgroundId` is the player's equipped background; while
 * the save is still loading it is undefined and the shipped chrome is used, so
 * there is never a flash of un-themed UI followed by a themed one — the
 * loading screen is deliberately the default chrome in every theme.
 */
export function ThemeProvider({
  backgroundId,
  children,
}: {
  backgroundId: string | undefined;
  children: React.ReactNode;
}) {
  const chrome = useMemo(() => chromeFor(backgroundId), [backgroundId]);
  return <ChromeCtx.Provider value={chrome}>{children}</ChromeCtx.Provider>;
}

/** The ground tokens for the equipped sky. */
export function useChrome(): Chrome {
  return useContext(ChromeCtx);
}

/**
 * Per-theme stylesheet cache.
 *
 * WeakMap on the factory so a screen that unmounts for good does not pin its
 * sheets; inner Map on the Chrome object, whose identity is stable per
 * background (see theme.ts). Bounded by themes x factories, which is 4 x ~6.
 */
const CACHE = new WeakMap<object, Map<Chrome, unknown>>();

/** The stylesheet for `factory` under the current chrome, built at most once. */
export function useThemedStyles<T>(factory: (c: Chrome) => T): T {
  const chrome = useChrome();
  return useMemo(() => {
    let byChrome = CACHE.get(factory);
    if (!byChrome) {
      byChrome = new Map();
      CACHE.set(factory, byChrome);
    }
    let sheet = byChrome.get(chrome) as T | undefined;
    if (sheet === undefined) {
      sheet = factory(chrome);
      byChrome.set(chrome, sheet);
    }
    return sheet;
  }, [factory, chrome]);
}
