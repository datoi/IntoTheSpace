// The particle field.
//
// A fixed pool of MAX_PARTICLES views, mounted once and never unmounted: the
// live particles take the front slots and the tail sits parked at opacity 0. A
// burst therefore costs style updates, not mounts — which is the point, because
// creating a view is far more expensive than moving one, and bursts arrive
// exactly when the frame can least afford it (a Nova clearing a formation, a
// boss going up).
//
// --- Why this is rendered by React and not written imperatively --------------
//
// It used to call setNativeProps on a ref per slot per frame, deliberately
// coalescing each particle's position, size, colour and opacity into ONE native
// write. That was the right call on the OLD React Native architecture, where
// the alternative was several JS-driven Animated setValues per particle, each
// flushing to the view on its own.
//
// This app builds on the New Architecture (Expo SDK 54's default — nothing in
// app.json opts out), and there that reasoning inverts. setNativeProps is a
// legacy API on Fabric, serviced by a compatibility shim that clones the shadow
// node and commits per call — so a full field was doing FORTY tree commits a
// frame, where React batches the same forty updates into one. The parent
// already renders every frame, so folding the field back into that render costs
// nothing extra and collapses those commits into the one that was happening
// anyway.
//
// Positions are transforms, never left/top: a transform is the one thing a view
// can change without re-running layout (see the note at the top of GameScreen).

import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Particle } from '../game/types';
import { MAX_PARTICLES } from '../game/constants';

/** Stable slot indices — the pool's shape never changes, only what fills it. */
const SLOTS = Array.from({ length: MAX_PARTICLES }, (_, i) => i);

function ParticleLayer({ particles, squared = false }: { particles: Particle[]; squared?: boolean }) {
  const live = Math.min(particles.length, MAX_PARTICLES);
  return (
    <>
      {SLOTS.map((i) => {
        // Retired slots share ONE style object. Identical by reference frame
        // after frame, so React skips them entirely rather than diffing an
        // invisible view — an idle field costs nothing.
        if (i >= live) return <View key={i} pointerEvents="none" style={styles.idle} />;
        const p = particles[i];
        return (
          <View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: p.size,
              height: p.size,
              // A rounded background is drawn through a path rather than a
              // plain quad, so it is the more expensive primitive — and there
              // are MAX_PARTICLES of them, rewritten every frame. Sparks are
              // 4–9px and always in fast motion, so at the sizes and speeds
              // involved a square is not distinguishable from a circle. Shed
              // only when the governor has already decided this device is
              // struggling; a phone holding the budget keeps its round sparks.
              borderRadius: squared ? undefined : p.size / 2,
              backgroundColor: p.color,
              opacity: Math.min(p.life * 2.5, 1),
              transform: [{ translateX: p.x }, { translateY: p.y }],
            }}
          />
        );
      })}
    </>
  );
}

export default ParticleLayer;

const styles = StyleSheet.create({
  idle: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    opacity: 0,
  },
});
