import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import {
  SHIELD_RING,
  SHIELD_COLOR,
  SHIELD_ARC_W,
  BULWARK_RING,
  BULWARK_COLOR,
  BULWARK_ARC_W,
  BULWARK_MID_ALPHA,
  BULWARK_RIM_ALPHA,
  BULWARK_SPIN_MS,
  SHELL_CLEAR_R,
  SHELL_MID_R,
  SHELL_MID_ALPHA,
  SHELL_RIM_ALPHA,
  SHELL_HALO_ALPHA,
  SHELL_HALO_W,
  SHELL_ARC_GAP,
  SHELL_ARC_SPENT_ALPHA,
  SHELL_SPIN_MS,
  SHELL_BREATHE_MS,
  SHELL_BREATHE,
  SHELL_HARDEN,
  SHELL_IMPACT_DOT,
  SHELL_IMPACT_SCALE,
  SHELL_BREAK_MS,
  SHELL_BREAK_BODY_SCALE,
  SHELL_BREAK_RING_SCALE,
} from '../game/constants';

/**
 * The protective volume around the player's hull — the SHIELD boon, and
 * Ironclad's BULWARK.
 *
 * --- Why this is one component and not two ---------------------------------
 *
 * These shipped as two near-identical `<View>`s with a border: 92px vs 96px
 * across, a 2.5px vs a 3.5px stroke, 10% vs 16% fill, at the SAME hue. So the
 * whole visual difference between "absorbs three hits" and "absorbs everything
 * and fires it back" was four pixels of diameter. Sharing one primitive means
 * the ranking between them is a set of parameters that all point the same way
 * (see the BULWARK_* block in constants.ts) instead of two stylesheets that
 * happen, today, to differ slightly.
 *
 * --- Why a gradient and not a stroke ---------------------------------------
 *
 * A constant-width, constant-alpha outline is a CONTOUR — the visual grammar of
 * a selection ring, which is exactly what the shield used to read as. Volume
 * comes from opacity RAMPING toward the silhouette, because a transparent
 * sphere has more material along the line of sight at its edge than through its
 * middle. That ramp is what a fresnel shader produces; here it is an SVG
 * radial gradient, which in a top-down 2D game is not an approximation of
 * fresnel but the entire thing, since there is no view angle to respond to.
 *
 * The interior is FULLY transparent out to SHELL_CLEAR_R. That is a legibility
 * rule, not an aesthetic one: the hull, and any bullet crossing the field, must
 * never be tinted. Only the outer band carries the shell.
 *
 * --- Why the rim is segmented ----------------------------------------------
 *
 * The boon's segments ARE its charges. Opacity used to carry both "time running
 * out" and "charges spent" as a single multiplied scalar, so neither read — and
 * the charge term only spanned 0.45→1.0 across all three, an ~18% change per
 * charge, under the just-noticeable threshold against a moving nebula. Now:
 * discrete arcs count the charges, and a blink carries the time. BULWARK has no
 * charge budget, so its rim is a single unbroken band — a read that survives any
 * size and does not depend on colour.
 *
 * --- Why nothing here re-renders -------------------------------------------
 *
 * The shell follows a ship that moves every frame, and it can be on screen for
 * seconds with a full board. So position does NOT arrive as a prop: it arrives
 * as two `Animated.Value`s the game loop writes with `setValue()`, the same way
 * the parallax scrolls. Every other moving part — spin, breathe, impact, break
 * — is a native-driver `Animated` loop over a STATIC svg tree; no SVG prop is
 * ever animated. The component is memoised on the handful of primitives that
 * actually change (charges, breaking, expiring), so its subtree mounts once per
 * pickup and is never reconciled again.
 *
 * That makes it cheaper per frame than the `<View>` it replaces, which
 * allocated a fresh style object and reconciled sixty times a second in order
 * to look identical.
 */

export type ShellStrength = 'shield' | 'bulwark';

interface ShellSpec {
  d: number;
  color: string;
  arcW: number;
  midAlpha: number;
  rimAlpha: number;
  spinMs: number;
}

const SPEC: Record<ShellStrength, ShellSpec> = {
  shield: {
    d: SHIELD_RING,
    color: SHIELD_COLOR,
    arcW: SHIELD_ARC_W,
    midAlpha: SHELL_MID_ALPHA,
    rimAlpha: SHELL_RIM_ALPHA,
    spinMs: SHELL_SPIN_MS,
  },
  bulwark: {
    d: BULWARK_RING,
    color: BULWARK_COLOR,
    arcW: BULWARK_ARC_W,
    midAlpha: BULWARK_MID_ALPHA,
    rimAlpha: BULWARK_RIM_ALPHA,
    spinMs: BULWARK_SPIN_MS,
  },
};

interface Props {
  strength: ShellStrength;
  /** Hull centre, written by the game loop with setValue(). Never a plain number. */
  x: Animated.Value;
  y: Animated.Value;
  /**
   * Charges left, and the budget they are drawn against. `segments` of 0 means
   * an unbroken rim — the shell has no budget to show (BULWARK).
   */
  charges?: number;
  segments?: number;
  /** 1 at the instant of an absorbed hit, decayed to 0 by the caller. */
  impact: Animated.Value;
  /** Degrees to the contact point, set instantly by the caller before `impact`. */
  impactAngle: Animated.Value;
  /** Playing its shatter. The caller keeps it mounted for SHELL_BREAK_MS. */
  breaking?: boolean;
  /** In its final second — carried as a blink, separately from the charges. */
  expiring?: boolean;
  reduceMotion?: boolean;
  /** Quality tier. Above 0 the two idle loops stop; the impact never does. */
  tier?: number;
}

function EnergyShellBase({
  strength,
  x,
  y,
  charges = 0,
  segments = 0,
  impact,
  impactAngle,
  breaking = false,
  expiring = false,
  reduceMotion = false,
  tier = 0,
}: Props) {
  const spec = SPEC[strength];
  const { d, color, arcW } = spec;
  // The svg box is larger than the shell so the halo has somewhere to bloom
  // into. The wrapper stays exactly `d` — it is the shell's real footprint, and
  // what the position tests measure.
  const box = d + SHELL_HALO_W * 2;
  // Where the shell's true edge falls inside that larger box, as a gradient
  // offset. Everything past it is bloom.
  const rimAt = d / 2 / (box / 2);

  const spin = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const shatter = useRef(new Animated.Value(0)).current;

  // Idle motion. Both loops are pure texture, so the governor and reduce-motion
  // both switch them off — the shell still reads, it just stops breathing.
  const still = reduceMotion || tier > 0;
  useEffect(() => {
    if (still) {
      spin.setValue(0);
      breathe.setValue(0);
      return;
    }
    const loops = [
      Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: spec.spinMs,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, {
            toValue: 1,
            duration: SHELL_BREATHE_MS / 2,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(breathe, {
            toValue: 0,
            duration: SHELL_BREATHE_MS / 2,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      ),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [still, spin, breathe, spec.spinMs]);

  // The final second. A blink rather than a dim, because dimming is what the
  // charges used to do and the two signals have to be told apart.
  useEffect(() => {
    if (!expiring) {
      blink.setValue(1);
      return;
    }
    if (reduceMotion) {
      blink.setValue(0.6); // steady — the warning still reads without flashing
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.42, duration: 130, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 130, easing: Easing.linear, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [expiring, reduceMotion, blink]);

  // The shatter. One shot, and the ring is given a bigger scale than the body
  // so the lattice visibly separates from the bubble on its way out — that
  // separation is what makes it read as breaking rather than fading.
  useEffect(() => {
    if (!breaking) return;
    Animated.timing(shatter, {
      toValue: 1,
      duration: SHELL_BREAK_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [breaking, shatter]);

  // --- Derived native-driven styles ------------------------------------------
  // Built once per render, and this component renders a handful of times per
  // pickup. Nothing below ever touches the JS thread per frame.

  const shellOpacity = Animated.multiply(
    blink,
    shatter.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' })
  );

  // The body flexes INWARD on impact — the field taking the load — then breathes.
  const bodyScale = Animated.add(
    Animated.add(
      breathe.interpolate({ inputRange: [0, 1], outputRange: [1 - SHELL_BREATHE, 1 + SHELL_BREATHE] }),
      impact.interpolate({ inputRange: [0, 1], outputRange: [0, -0.055], extrapolate: 'clamp' })
    ),
    shatter.interpolate({ inputRange: [0, 1], outputRange: [0, SHELL_BREAK_BODY_SCALE - 1], extrapolate: 'clamp' })
  );

  const ringScale = Animated.add(
    1,
    shatter.interpolate({ inputRange: [0, 1], outputRange: [0, SHELL_BREAK_RING_SCALE - 1], extrapolate: 'clamp' })
  );

  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const impactDeg = impactAngle.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });
  const rippleScale = impact.interpolate({
    inputRange: [0, 1],
    outputRange: [SHELL_IMPACT_SCALE, 0.4],
    extrapolate: 'clamp',
  });

  // The charge ring. `segments` of 0 draws one unbroken band (BULWARK); any
  // other count draws that many arcs, with the spent ones left inert rather
  // than removed, so the budget stays countable at a glance.
  const r = (d - arcW) / 2;
  const circumference = 2 * Math.PI * r;
  const arcs = useMemo(() => {
    if (segments <= 0) return [{ key: 'solid', dash: undefined as number[] | undefined, offset: 0, lit: true }];
    const step = circumference / segments;
    const lit = step * (1 - SHELL_ARC_GAP);
    return Array.from({ length: segments }, (_, i) => ({
      key: `arc${i}`,
      dash: [lit, circumference - lit],
      offset: -i * step,
      lit: i < charges,
    }));
  }, [segments, charges, circumference]);

  const gradId = `shell-${strength}`;

  return (
    <Animated.View
      pointerEvents="none"
      // The shell's own handle. Its inner layers share the wrapper's diameter
      // and corner radius, so anything identifying it by geometry alone would
      // pick up the hardening rim instead — which sits at the origin and would
      // read as the shell being in the wrong place.
      testID={`${strength}-shell`}
      style={[
        styles.shell,
        {
          width: d,
          height: d,
          borderRadius: d / 2,
          // `x`/`y` are the HULL CENTRE, shared by both shells. Each recentres
          // itself with its own half-diameter, in the layout box rather than in
          // the transform — so one pair of animated values serves two different
          // diameters, and the offset stays readable to anything measuring
          // where this actually sits.
          left: -d / 2,
          top: -d / 2,
          opacity: shellOpacity,
          // Written by the loop, so this transform changes without the subtree
          // reconciling.
          transform: [{ translateX: x }, { translateY: y }],
        },
      ]}
    >
      {/* The volume: clear over the hull, ramping to a bright rim, blooming out. */}
      <Animated.View
        style={[
          styles.body,
          { left: -SHELL_HALO_W, top: -SHELL_HALO_W, width: box, height: box, transform: [{ scale: bodyScale }] },
        ]}
      >
        <Svg width={box} height={box}>
          <Defs>
            <RadialGradient id={gradId} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={color} stopOpacity={0} />
              <Stop offset={`${SHELL_CLEAR_R * rimAt}`} stopColor={color} stopOpacity={0} />
              <Stop offset={`${SHELL_MID_R * rimAt}`} stopColor={color} stopOpacity={spec.midAlpha} />
              <Stop offset={`${rimAt}`} stopColor={color} stopOpacity={spec.rimAlpha} />
              {/* The bloom: the tail of the same ramp, past the shell's real
                  edge. The closest thing to a glow available without
                  post-processing, and it costs no extra node. */}
              <Stop offset={`${rimAt + (1 - rimAt) * 0.35}`} stopColor={color} stopOpacity={SHELL_HALO_ALPHA} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={box / 2} cy={box / 2} r={box / 2} fill={`url(#${gradId})`} />
        </Svg>
      </Animated.View>

      {/* The charge ring. Spins slowly so the field reads as energised. */}
      <Animated.View
        style={[styles.layer, { width: d, height: d, transform: [{ rotate: spinDeg }, { scale: ringScale }] }]}
      >
        <Svg width={d} height={d}>
          {arcs.map((a) => (
            <Circle
              key={a.key}
              cx={d / 2}
              cy={d / 2}
              r={r}
              stroke={color}
              strokeWidth={arcW}
              strokeLinecap="round"
              strokeOpacity={a.lit ? 1 : SHELL_ARC_SPENT_ALPHA}
              strokeDasharray={a.dash}
              strokeDashoffset={a.offset}
              fill="none"
            />
          ))}
        </Svg>
      </Animated.View>

      {/* The hardening. For the length of an impact the soft volume shows a
          hard edge — the field visibly solidifying to take the hit, which is
          the one moment a contour is the right thing to draw. */}
      <Animated.View
        style={[
          styles.layer,
          {
            width: d,
            height: d,
            borderRadius: d / 2,
            borderWidth: arcW * 0.9,
            borderColor: color,
            // Scaled by SHELL_HARDEN rather than driven to full: the hard edge
            // is a flicker of structure inside the volume, not a replacement
            // for it. At full opacity it just looked like the old outline had
            // come back for a third of a second.
            opacity: Animated.multiply(impact, SHELL_HARDEN),
          },
        ]}
      />

      {/* The ripple, at the contact point. The wrapper is rotated to the angle
          of the hit and the disc sits on the rim at twelve o'clock, so the
          flare lands exactly where the shot stopped. */}
      <Animated.View style={[styles.layer, { width: d, height: d, transform: [{ rotate: impactDeg }] }]}>
        <Animated.View
          style={[
            styles.ripple,
            {
              left: (d - SHELL_IMPACT_DOT) / 2,
              top: -SHELL_IMPACT_DOT / 2,
              width: SHELL_IMPACT_DOT,
              height: SHELL_IMPACT_DOT,
              borderRadius: SHELL_IMPACT_DOT / 2,
              backgroundColor: color,
              opacity: impact,
              transform: [{ scale: rippleScale }],
            },
          ]}
        />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Memoised on the primitives that actually change.
 *
 * `x`, `y`, `impact` and `impactAngle` are Animated.Values held in refs by the
 * caller, so their identity is stable for the life of the run and they are
 * deliberately NOT compared — they carry their changes natively, not through
 * React. Comparing them would be meaningless; passing raw numbers instead would
 * re-render this whole subtree sixty times a second, which is the thing the
 * design is built to avoid.
 */
export const EnergyShell = React.memo(
  EnergyShellBase,
  (a, b) =>
    a.strength === b.strength &&
    a.charges === b.charges &&
    a.segments === b.segments &&
    a.breaking === b.breaking &&
    a.expiring === b.expiring &&
    a.reduceMotion === b.reduceMotion &&
    a.tier === b.tier
);

const styles = StyleSheet.create({
  // Placed with a transform, never left/top — see the note at the top of
  // GameScreen.tsx. The box is the shell's own footprint.
  shell: {
    position: 'absolute',
  },
  body: { position: 'absolute' },
  layer: { position: 'absolute', left: 0, top: 0 },
  ripple: { position: 'absolute' },
});

export default EnergyShell;
