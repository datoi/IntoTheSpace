// The on-device frame-time readout.
//
// Every optimisation before this one was reasoned from the code. That gets you
// the obvious wins and then it stops: "the game lags under load" has at least
// three unrelated causes that look identical from the outside — the JS
// simulation, React's per-frame reconciliation, and the GPU compositing the
// frame — and fixing the wrong one costs a release cycle to discover.
//
// So the loop times each of those separately and this prints the split:
//
//   sim     the game loop itself: movement, collision, spawning
//   react   rendering and committing the React tree
//   rest    frame interval minus the two above — native layout, the GPU, and
//           anything waiting on the main thread (this is where overdraw lands)
//
// Whichever of the three dominates is the one worth working on. `rest` being
// large with a small `sim` and `react` means the phone is fill-rate bound and
// no amount of JS tuning will help; the opposite means the reverse.
//
// Turn it on with PERF_OVERLAY in constants.ts, and read it from a RELEASE
// build — a dev build's React overhead would inflate `react` and send you after
// a problem that doesn't exist in the shipped game.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PALETTE, QUALITY_TIERS } from '../game/constants';
import { TYPE } from '../game/type';

/** Millisecond clock. performance.now() where it exists — Date.now()'s 1ms
 *  granularity is too coarse to resolve a 2ms simulation step. */
export const nowMs = (): number => {
  const p = (globalThis as { performance?: { now?: () => number } }).performance;
  return p?.now ? p.now() : Date.now();
};

export interface PerfStats {
  /** Delivered interval between simulated frames. The number that matters. */
  frameMs: number;
  /** Time inside update() plus the particle sync. */
  simMs: number;
  /** Time from React starting the render to the commit landing. */
  renderMs: number;
  /** Live entity counts, so a spike can be tied to what was on screen. */
  cards: number;
  bullets: number;
  enemyBullets: number;
  particles: number;
  explosions: number;
  /** Current adaptive-quality tier — 0 is full detail. */
  tier: number;
}

export const newPerfStats = (): PerfStats => ({
  frameMs: 0,
  simMs: 0,
  renderMs: 0,
  cards: 0,
  bullets: 0,
  enemyBullets: 0,
  particles: 0,
  explosions: 0,
  tier: 0,
});

/** Refresh rate of the readout itself. Slow on purpose: the overlay must not
 *  become a meaningful share of what it is measuring. */
const REFRESH_MS = 400;

const ms = (v: number) => v.toFixed(1);

/**
 * Memoized with a ref for its data, so the parent's per-frame render never
 * reaches it — it re-reads and repaints on its own slow interval instead.
 */
const PerfOverlay = React.memo(function PerfOverlay({
  stats,
}: {
  stats: React.RefObject<PerfStats>;
}) {
  const [, repaint] = useState(0);
  useEffect(() => {
    const id = setInterval(() => repaint((n) => n + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const s = stats.current;
  if (!s) return null;
  const fps = s.frameMs > 0 ? 1000 / s.frameMs : 0;
  // Everything the two JS measurements don't account for.
  const rest = Math.max(0, s.frameMs - s.simMs - s.renderMs);
  const health = s.frameMs <= 18 ? PALETTE.plasma : s.frameMs <= 26 ? PALETTE.amber : PALETTE.threat;

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Text style={[styles.head, { color: health }]}>
        {fps.toFixed(0)} FPS · {ms(s.frameMs)}ms
      </Text>
      <Text style={styles.row}>sim {ms(s.simMs)}</Text>
      <Text style={styles.row}>react {ms(s.renderMs)}</Text>
      <Text style={styles.row}>rest {ms(rest)}</Text>
      <Text style={styles.row}>
        e{s.cards} b{s.bullets} x{s.enemyBullets}
      </Text>
      <Text style={styles.row}>
        p{s.particles} f{s.explosions} · Q{s.tier}/{QUALITY_TIERS.length - 1}
      </Text>
    </View>
  );
});

export default PerfOverlay;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 8,
    top: 120,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  head: {
    ...TYPE.micro,
    color: PALETTE.ink,
  },
  row: {
    ...TYPE.micro,
    color: PALETTE.inkDim,
  },
});
