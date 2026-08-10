// The four micro-interactions from the spec, and nothing else.
//
// The play field is already busy; the interface's job is to be legible inside
// that noise, so everything not listed here stays still.
//
//   Score roll-up   count to the new value over 250ms, ease-out
//   Ribbon slam     enter at 1.35 → 1.0 over 180ms — the only bounce in the game
//   Chip slide      in from the left over 140ms, fade out in place
//   Low-hull pulse  threatGlow edge vignette, 1.2s cycle, at 1 segment only
//
// All four respect the OS reduce-motion setting: the roll-up and the overshoot
// drop out, the state changes remain. Motion is decoration here — a player who
// has asked the system to stop animating things must still see the score change.

import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { PALETTE } from '../game/constants';

/**
 * Whether the OS has asked for reduced motion.
 *
 * Read once and then subscribed, so a mid-session toggle is honoured without
 * every animated component polling.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    // Every call here is guarded: this is an accessibility *preference*, and a
    // platform that cannot report it must degrade to "motion allowed" rather
    // than throw. `addEventListener` in particular does not return a
    // subscription on every platform/version, and calling .remove() on the
    // undefined it hands back would throw during unmount — which surfaces as an
    // opaque teardown failure a long way from this line.
    AccessibilityInfo.isReduceMotionEnabled?.()
      ?.then((v) => {
        if (alive) setReduce(!!v);
      })
      .catch(() => {});
    let sub: { remove?: () => void } | undefined;
    try {
      sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => setReduce(!!v));
    } catch {
      sub = undefined;
    }
    return () => {
      alive = false;
      try {
        sub?.remove?.();
      } catch {
        // Nothing to unsubscribe from — not worth failing an unmount over.
      }
    };
  }, []);
  return reduce;
}

const ROLL_MS = 250;

/**
 * A number that counts up to its new value rather than snapping.
 *
 * Driven by a JS-side Animated.Value with a listener, because the value has to
 * become TEXT — there is no native path for that. It's one listener writing one
 * setState per frame for a quarter-second after a score change, which is why the
 * duration is short and the component is memoized.
 *
 * Tabular figures (see TYPE.score) are what keep the digits from jittering
 * sideways as they climb.
 */
export const RollingNumber = React.memo(function RollingNumber({
  value,
  style,
  reduceMotion,
}: {
  value: number;
  style?: object;
  reduceMotion?: boolean;
}) {
  const anim = useRef(new Animated.Value(value)).current;
  const [shown, setShown] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    if (reduceMotion) {
      // No roll — but the number must still update.
      setShown(value);
      prev.current = value;
      anim.setValue(value);
      return;
    }
    // A decrease (a new run starting) snaps: counting *down* to zero reads as a
    // bug rather than as a reward.
    if (value < prev.current) {
      anim.setValue(value);
      setShown(value);
      prev.current = value;
      return;
    }
    const id = anim.addListener(({ value: v }) => setShown(Math.round(v)));
    Animated.timing(anim, {
      toValue: value,
      duration: ROLL_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start(() => {
      setShown(value);
      anim.removeListener(id);
    });
    prev.current = value;
    return () => anim.removeListener(id);
  }, [value, anim, reduceMotion]);

  return <Text style={style}>{shown.toLocaleString()}</Text>;
});

/**
 * A status chip sliding in from the left.
 *
 * It fades out IN PLACE rather than sliding back, because a chip retreating
 * would drag the eye away from the play field at exactly the moment the player
 * needs to notice the effect has ended.
 */
export function ChipSlide({
  children,
  reduceMotion,
}: {
  children: React.ReactNode;
  reduceMotion?: boolean;
}) {
  const x = useRef(new Animated.Value(reduceMotion ? 0 : -24)).current;
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) {
      x.setValue(0);
      opacity.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.timing(x, { toValue: 0, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start();
  }, [x, opacity, reduceMotion]);
  return (
    <Animated.View style={{ opacity, transform: [{ translateX: x }] }}>{children}</Animated.View>
  );
}

const PULSE_MS = 1200;

/**
 * The last-hull warning: a slow threat vignette around the screen edge.
 *
 * 1.2s and NEVER faster. A quick pulse stops reading as a warning and starts
 * reading as a rendering fault — and at one heart the player is already under
 * enough pressure without the UI appearing to break.
 */
export function LowHullPulse({ active, reduceMotion }: { active: boolean; reduceMotion?: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      pulse.setValue(0);
      return;
    }
    if (reduceMotion) {
      // Steady rather than pulsing — the warning still reads.
      pulse.setValue(0.7);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: PULSE_MS / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.25, duration: PULSE_MS / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse, reduceMotion]);

  if (!active) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.vignette, { opacity: pulse }]}>
      <View style={styles.vignetteEdge} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  vignette: {
    ...StyleSheet.absoluteFillObject,
  },
  // A thick inset border reads as a vignette without needing a gradient library.
  vignetteEdge: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 26,
    borderColor: PALETTE.threatGlow,
    borderRadius: 34,
  },
});
