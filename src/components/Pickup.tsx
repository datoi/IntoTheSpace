import React from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Card } from '../game/types';
import { BOONS, isInstant } from '../game/pickups';
import {
  PICKUP_VIS,
  PICKUP_HALO_R,
  PICKUP_HALO_ALPHA,
  PICKUP_HALO_CORE,
  PICKUP_BOB_PX,
  PICKUP_SWAY_PX,
  PICKUP_HALO_PULSE,
  PICKUP_SPIN_DEG,
  PICKUP_PHASES,
  PICKUP_POP_SCALE,
  PICKUP_RING_SCALE,
  PICKUP_RING_W,
  PICKUP_RING_FRAC,
  CAPSULE_W,
  CAPSULE_H,
  CAPSULE_FILL,
  CRYSTAL_R,
  GUN_GLOW,
  GUN_HALO_R,
  GUN_HALO_ALPHA,
  GUN_HALO_CORE,
  BOON_EMOJI,
  COIN_VIS,
  HEART_ICON,
  GIFT_ICON,
  GIFT_DOUBLE_GAP,
  GUN_DROP_VIS,
  GIFT_SHOT_LEN,
  GUN_PICKUP_IMG,
  ShotArt,
  PALETTE,
  laneX,
} from '../game/constants';
import CoinIcon from './Coin';
import Icon from './Icon';

/**
 * Falling pickups: boons, coins, hearts and gun drops.
 *
 * --- Why this is one component ----------------------------------------------
 *
 * These were four branches inside Obstacle.tsx wearing three different sizes
 * (44 / 50 / 50), two different glow systems and, in the coin's case, none at
 * all. Nothing was wrong with any one of them; together they made the screen
 * look assembled rather than designed. One component means one footprint, one
 * halo, one idle behaviour and one collection moment, with the drop types
 * differing only where the difference carries information.
 *
 * --- Shape is a channel ------------------------------------------------------
 *
 * Fourteen boons shared ONE silhouette — a 36px disc with a 2.5px border — and
 * six colours between them, four of which land on amber alone. So colour was
 * being asked to carry information colour cannot carry, and the 24px glyph had
 * to do the rest at falling speed. Silhouette is most of how fast a thing
 * reads, so the CLASS now owns the shape:
 *
 *   capsule  a timed boon — upright, with a charge level. It runs out.
 *   crystal  an instant boon, and a heart — faceted, tumbling, no reservoir.
 *   disc     a coin. Already the universal read for money; left alone.
 *   none     a gun drop. The only drop with NO container: raw ordnance in its
 *            own light. See the GUN_GLOW block in constants.ts — it wore four
 *            corner brackets, and four corners imply a rectangle whether or not
 *            one is drawn, so the "hardware" tell was reading as a card instead.
 *            Contained / minted / free is a category difference, which is a
 *            harder line than one more shape in the same family.
 *
 * Shape, colour and glyph are now three independent channels. A colourblind
 * player keeps two of them.
 *
 * --- Why nothing here animates itself ---------------------------------------
 *
 * ObstacleView is deliberately unmemoised — the loop mutates cards in place, so
 * a prop check would freeze every entity at its spawn point — which means
 * anything drawn here is re-rendered sixty times a second. An `.interpolate()`
 * in this file would therefore allocate a new Animated node per pickup per
 * frame and grow the animation graph without bound.
 *
 * So: ONE looping value lives in GameScreen, `makePickupPhases` turns it into a
 * fixed set of phase buckets ONCE, and a pickup picks its bucket by `id %
 * PICKUP_PHASES` and merely references those nodes. Nothing is built per frame.
 * On top of that the artwork lives in a memoised body whose props are constant
 * for a given card, so the drawing reconciles once per pickup lifetime while
 * only the positional wrapper re-renders.
 */

// --- The shared idle motion --------------------------------------------------

export interface PickupPhase {
  bob: Animated.AnimatedInterpolation<number>;
  sway: Animated.AnimatedInterpolation<number>;
  halo: Animated.AnimatedInterpolation<number>;
  spin: Animated.AnimatedInterpolation<string>;
}

/** Control points per wave. Enough that a piecewise-linear ramp reads as a sine. */
const WAVE_POINTS = 9;

/**
 * A phase-shifted wave over a 0..1 loop, as a pre-built interpolation.
 *
 * Piecewise-linear rather than a real sine because `interpolate` cannot call
 * one — but sampled at nine points, across an amplitude of three pixels, the
 * difference is not visible. What matters is that it is built ONCE.
 */
function wave(
  v: Animated.Value,
  phase: number,
  amp: number,
  centre = 0
): Animated.AnimatedInterpolation<number> {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let k = 0; k < WAVE_POINTS; k++) {
    const f = k / (WAVE_POINTS - 1);
    inputRange.push(f);
    outputRange.push(centre + Math.sin((f + phase) * Math.PI * 2) * amp);
  }
  return v.interpolate({ inputRange, outputRange });
}

/**
 * Build every phase bucket, once, from the one looping value.
 *
 * `sway` runs at HALF the rate of `bob` on purpose: two waves at the same
 * frequency trace a straight diagonal, and the drop reads as sliding rather
 * than floating. Different rates trace a slow Lissajous, which is what
 * "suspended, not falling on rails" actually looks like.
 */
export function makePickupPhases(v: Animated.Value): PickupPhase[] {
  return Array.from({ length: PICKUP_PHASES }, (_, i) => {
    const p = i / PICKUP_PHASES;
    return {
      bob: wave(v, p, PICKUP_BOB_PX),
      sway: wave(v, p * 0.5 + 0.13, PICKUP_SWAY_PX),
      halo: wave(v, p + 0.25, PICKUP_HALO_PULSE, 1),
      spin: v.interpolate({
        inputRange: [0, 1],
        // Offset per bucket so two crystals on screen are never at the same angle.
        outputRange: [`${p * PICKUP_SPIN_DEG}deg`, `${(p + 1) * PICKUP_SPIN_DEG}deg`],
      }),
    };
  });
}

// --- Silhouettes -------------------------------------------------------------

const C = PICKUP_VIS / 2; // centre of the footprint

/** Six points of the crystal, flat-topped, as an SVG polygon path. */
const CRYSTAL_PATH = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    // -90° start puts a vertex at the top, so the shard reads as pointing up.
    const a = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(`${(C + Math.cos(a) * CRYSTAL_R).toFixed(2)},${(C + Math.sin(a) * CRYSTAL_R).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
})();

/** The two interior facet lines that stop the crystal reading as a flat hexagon. */
const CRYSTAL_FACETS = (() => {
  const top = `${C},${C - CRYSTAL_R}`;
  const bottom = `${C},${C + CRYSTAL_R}`;
  const l = `${(C - CRYSTAL_R * 0.866).toFixed(2)},${(C - CRYSTAL_R * 0.5).toFixed(2)}`;
  const r = `${(C + CRYSTAL_R * 0.866).toFixed(2)},${(C + CRYSTAL_R * 0.5).toFixed(2)}`;
  return `M${top}L${l}M${top}L${r}M${bottom}L${l}M${bottom}L${r}`;
})();

/**
 * The halo and the silhouette, in one svg root.
 *
 * Combined rather than split because each `<Svg>` is a native view: two roots
 * per pickup would double the mount cost of the one thing on this board that
 * can arrive fourteen at a time.
 */
function Shell({ kind, color }: { kind: 'capsule' | 'crystal'; color: string }) {
  // Keyed by COLOUR as well as shape. Two capsules of different boons are on
  // screen together often (a shield and a magnet), and react-native-svg has not
  // always scoped `Defs` ids per root on Android — so a shared id risks the
  // second drop painting itself with the first one's gradient.
  const id = `pk-${kind}-${color.replace('#', '')}`;
  return (
    // The silhouette is the point of this redesign, so it gets a handle: a test
    // that asserts "a timed boon looks different from an instant one" should
    // ask which SHELL was drawn, not go fishing for svg primitives.
    <Svg testID={`pickup-${kind}`} width={PICKUP_VIS} height={PICKUP_VIS} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset={`${PICKUP_HALO_CORE}`} stopColor={color} stopOpacity={PICKUP_HALO_ALPHA} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* The lit volume the object sits in. Ramping outward, so it reads as a
          glow around a thing rather than as a coloured sticker behind it. */}
      <Circle cx={C} cy={C} r={PICKUP_VIS * PICKUP_HALO_R} fill={`url(#${id})`} />
      {kind === 'capsule' ? (
        <>
          {/* The canister. Stadium-shaped and upright: a vial only reads as a
              vial the right way up, which is why capsules never tumble. */}
          <Rect
            x={C - CAPSULE_W / 2}
            y={C - CAPSULE_H / 2}
            width={CAPSULE_W}
            height={CAPSULE_H}
            rx={CAPSULE_W / 2}
            fill="rgba(8,10,18,0.78)"
            stroke={color}
            strokeWidth={2}
          />
          {/* The charge inside it. Decorative — a drop is always full — but it
              is the whole reason this silhouette says "this will run out". */}
          <Rect
            x={C - CAPSULE_W / 2 + 2}
            y={C + CAPSULE_H / 2 - 2 - (CAPSULE_H - 4) * CAPSULE_FILL}
            width={CAPSULE_W - 4}
            height={(CAPSULE_H - 4) * CAPSULE_FILL}
            rx={(CAPSULE_W - 4) / 2}
            fill={color}
            fillOpacity={0.3}
          />
        </>
      ) : (
        <>
          <Path d={CRYSTAL_PATH} fill="rgba(8,10,18,0.78)" stroke={color} strokeWidth={2} strokeLinejoin="round" />
          <Path d={CRYSTAL_FACETS} stroke={color} strokeWidth={1} strokeOpacity={0.35} fill="none" />
        </>
      )}
    </Svg>
  );
}

/**
 * A gun drop's glow, and the whole of its container.
 *
 * Just the ramp — no silhouette, no frame, no fill. A pure radial falloff in
 * the gun's own emission colour, which is what lets raw ordnance sit in space
 * instead of on a card. See the GUN_GLOW block in constants.ts for why the
 * brackets and the flat gold disc that used to be here both had to go.
 */
function GunHalo({ color }: { color: string }) {
  const id = `pk-gun-${color.replace('#', '')}`;
  // Drawn in its OWN box, which is larger than the shared footprint, and
  // centred on it by an equal negative offset. The wrapper stays PICKUP_VIS —
  // that is where the drop IS — while the glow is how big it READS.
  const off = (GUN_DROP_VIS - PICKUP_VIS) / 2;
  const c = GUN_DROP_VIS / 2;
  return (
    <Svg
      testID="pickup-gun-halo"
      width={GUN_DROP_VIS}
      height={GUN_DROP_VIS}
      style={[styles.gunHalo, { left: -off, top: -off }]}
    >
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset={`${GUN_HALO_CORE}`} stopColor={color} stopOpacity={GUN_HALO_ALPHA} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={GUN_DROP_VIS * GUN_HALO_R} fill={`url(#${id})`} />
    </Svg>
  );
}

// --- The body ----------------------------------------------------------------

interface BodyProps {
  kind: Card['kind'];
  boon?: Card['boon'];
  gun?: Card['gun'];
  emoji: string;
  avatarShot?: ShotArt;
  /** Undefined means hold still — reduce-motion, or a governor tier above 0. */
  phase?: PickupPhase;
}

function PickupBodyBase({ kind, boon, gun, emoji, avatarShot, phase }: BodyProps) {
  // --- Boons and hearts: a shell, plus the glyph that names the effect -------
  if (kind === 'boon' || kind === 'heart') {
    const def = boon ? BOONS[boon] : undefined;
    const color = def?.color ?? PALETTE.vital;
    // Timed effects get the capsule, instants get the crystal. A heart is an
    // instant effect, so it is a crystal — which is also what puts the one
    // pickup you most need to spot on the tumbling silhouette.
    const timed = !!boon && !isInstant(boon);
    const shell = timed ? 'capsule' : 'crystal';
    const glyph = def ? (
      <Icon name={def.icon} size={BOON_EMOJI} color={color} />
    ) : (
      <Icon name="hull" size={HEART_ICON} color={PALETTE.vital} filled />
    );
    return (
      <>
        {/* Only the SHELL tumbles. The glyph stays upright, because a rotating
            glyph is an unreadable glyph — this is why the two are separate
            layers rather than one rotated group. */}
        {phase && shell === 'crystal' ? (
          <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: phase.spin }] }]}>
            <Shell kind={shell} color={color} />
          </Animated.View>
        ) : (
          <Shell kind={shell} color={color} />
        )}
        <View style={styles.centre} pointerEvents="none">
          {glyph}
        </View>
      </>
    );
  }

  // --- Coins: the cheap path, deliberately ----------------------------------
  // A giant boss pays out BOSS_GIANT_COINS at once and luckyDrop adds eight
  // more, so coins are the only drop that arrives by the dozen — and they do it
  // at the busiest moment on the board. They get the shared footprint, halo and
  // idle motion, but the halo is two plain Views rather than a gradient: this
  // is the one place where mounting fourteen svg roots in a frame would be felt.
  if (kind === 'coin') {
    return (
      <>
        <View style={[styles.coinGlow, { backgroundColor: PALETTE.gold }]} pointerEvents="none" />
        <View style={[styles.coinGlowInner, { backgroundColor: PALETTE.gold }]} pointerEvents="none" />
        <View style={styles.centre} pointerEvents="none">
          <CoinIcon size={COIN_VIS} />
        </View>
      </>
    );
  }

  // --- Gun drops: uncontained ------------------------------------------------
  // The drop keeps wearing the art of the gun it grants — the player reads the
  // reward before committing to the grab, which was always the best idea in the
  // pickup code and is now doing even more work, because the art is the ONLY
  // thing drawn. Nothing frames it; the glow is its only surround, and it is the
  // gun's own light rather than a shared gold.
  const isDouble = gun === 'double' && avatarShot != null;
  const gunImg = gun && !isDouble ? GUN_PICKUP_IMG[gun] : undefined;
  const dShotThick = avatarShot ? GIFT_SHOT_LEN * avatarShot.aspect : 0;
  // A `double` drop wears the player's own bolt, so it glows in the equipped
  // hull's colour. Everything else reads its emission off its own art. The
  // final fallback is only reachable by a snapshot carrying a gun with no art.
  const glow = (isDouble ? avatarShot?.tint : gun && GUN_GLOW[gun]) ?? PALETTE.gold;
  return (
    <>
      <GunHalo color={glow} />
      <View style={styles.centre} pointerEvents="none">
        {isDouble && avatarShot ? (
          // Two of the avatar's own shots — what the drop actually doubles up
          // on. The art already points up, the way they fire, so neither is
          // rotated.
          <View style={styles.doubleGift}>
            {[-GIFT_DOUBLE_GAP, GIFT_DOUBLE_GAP].map((dx, k) => (
              <Image
                key={k}
                source={avatarShot.src}
                resizeMode="contain"
                fadeDuration={0}
                style={{
                  position: 'absolute',
                  left: C - dShotThick / 2 + dx,
                  top: C - GIFT_SHOT_LEN / 2,
                  width: dShotThick,
                  height: GIFT_SHOT_LEN,
                }}
              />
            ))}
          </View>
        ) : gunImg ? (
          // Gun-shot art points +x in the source; rotate the falling pickup so
          // it points up, like the shot it grants. (The symmetric bomb blast is
          // unaffected by the rotation.)
          <Image
            source={gunImg}
            style={[styles.giftIcon, { transform: [{ rotate: '-90deg' }] }]}
            resizeMode="contain"
            fadeDuration={0}
          />
        ) : (
          <Text style={styles.emoji}>{emoji}</Text>
        )}
      </View>
    </>
  );
}

/**
 * Memoised on values that are CONSTANT for a given card.
 *
 * `phase` is one of a fixed set of bucket objects built once by the caller, so
 * its identity is stable too. Every prop here therefore settles at spawn, and
 * this subtree — gradients, paths and all — reconciles once per pickup lifetime
 * instead of on each of the sixty frames its parent redraws.
 */
const PickupBody = React.memo(PickupBodyBase);

// --- The positional wrapper --------------------------------------------------

interface Props {
  ob: Card;
  avatarShot?: ShotArt;
  /** This card's bucket. Omitted when motion is off. */
  phase?: PickupPhase;
}

/**
 * Unmemoised by design: this is the half that has to move every frame, and the
 * card it reads is mutated in place.
 */
export default function PickupView({ ob, avatarShot, phase }: Props) {
  // Same fallback the loop's `cardX` uses, so a snapshot saved before pickups
  // carried a free x still lands on its lane instead of at the screen edge.
  const cx = ob.cx ?? laneX(ob.lane);
  const cy = ob.y + ob.h / 2;
  // Collection: a harder, faster snap than an enemy's death pop, because taking
  // a reward and killing a drone used to look identical.
  const t = Math.min(ob.deadT / 0.18, 1);
  const scale = ob.dead ? 1 + t * (PICKUP_POP_SCALE - 1) : 1;
  const opacity = ob.dead ? 1 - t : 1;
  // The ring is a flash over the first part of that window, not a fade across
  // all of it — it has to register as an impact, not as a dissolve.
  const ringT = ob.dead ? Math.min(t / PICKUP_RING_FRAC, 1) : 0;

  const base = [
    { translateX: cx - PICKUP_VIS / 2 },
    { translateY: cy - PICKUP_VIS / 2 },
  ];
  // Idle motion rides ON TOP of the position, as extra transform entries. A
  // fresh array per frame is unavoidable here (the parent re-renders), but the
  // NODES inside it are the caller's pre-built buckets — nothing is allocated
  // into the animation graph.
  const transform = (
    phase && !ob.dead
      ? [...base, { translateX: phase.sway }, { translateY: phase.bob }, { scale }]
      : [...base, { scale }]
  ) as never;

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity, transform }]}>
      {ob.dead && ringT < 1 && (
        <View
          testID="pickup-ring"
          pointerEvents="none"
          style={[
            styles.ring,
            {
              opacity: 1 - ringT,
              borderColor: ringColor(ob),
              transform: [{ scale: 1 + ringT * (PICKUP_RING_SCALE - 1) }],
            },
          ]}
        />
      )}
      {phase && !ob.dead ? (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: phase.halo }] }]}>
          <PickupBody
            kind={ob.kind}
            boon={ob.boon}
            gun={ob.gun}
            emoji={ob.emoji}
            avatarShot={avatarShot}
            phase={phase}
          />
        </Animated.View>
      ) : (
        <PickupBody
          kind={ob.kind}
          boon={ob.boon}
          gun={ob.gun}
          emoji={ob.emoji}
          avatarShot={avatarShot}
        />
      )}
    </Animated.View>
  );
}

/** The collect ring wears the colour of what was collected. */
function ringColor(ob: Card): string {
  if (ob.kind === 'boon' && ob.boon) return BOONS[ob.boon].color;
  if (ob.kind === 'heart') return PALETTE.vital;
  return PALETTE.gold;
}

const styles = StyleSheet.create({
  // Parked at the origin and moved by transform — obstacles move every frame,
  // and left/top would re-run layout on the whole subtree each time.
  wrap: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: PICKUP_VIS,
    height: PICKUP_VIS,
  },
  // `absoluteFill`, not `absoluteFillObject` — the latter was removed from the
  // RN 0.86 runtime, and spreading it yields {} silently rather than throwing.
  centre: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: PICKUP_VIS,
    height: PICKUP_VIS,
    borderRadius: PICKUP_VIS / 2,
    borderWidth: PICKUP_RING_W,
  },
  // Coins only: a two-layer View halo rather than a gradient. Banding is
  // invisible at this size and it costs a fraction of an svg root, which is the
  // trade worth making for the one drop a boss payout mounts fourteen of in a
  // single frame. Gun drops used to share this and no longer do — with no frame
  // left to help them, they need a real ramp (see GunHalo).
  coinGlow: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: PICKUP_VIS,
    height: PICKUP_VIS,
    borderRadius: PICKUP_VIS / 2,
    opacity: 0.12,
  },
  coinGlowInner: {
    position: 'absolute',
    left: PICKUP_VIS * 0.2,
    top: PICKUP_VIS * 0.2,
    width: PICKUP_VIS * 0.6,
    height: PICKUP_VIS * 0.6,
    borderRadius: PICKUP_VIS * 0.3,
    opacity: 0.2,
  },
  gunHalo: { position: 'absolute' },
  giftIcon: {
    width: GIFT_ICON,
    height: GIFT_ICON,
  },
  doubleGift: {
    position: 'absolute',
    width: PICKUP_VIS,
    height: PICKUP_VIS,
  },
  emoji: {
    fontSize: 30,
  },
});
