// The parallax sky, shared by the run and the menu.
//
// Extracted from GameScreen so the menu can stand in front of the same sky
// instead of flat black. The scroll model is unchanged and is the important
// part: each layer is a fixed vertical strip of tiles inside an Animated.View,
// moved by writing an Animated.Value, so scrolling costs NO React render —
// rebuilding these full-screen images every frame was a large slice of the
// CPU/GPU cost before.

import React, { useEffect, useMemo, useRef } from 'react';
import { View, Image, StyleSheet, Animated, Easing } from 'react-native';
import { PALETTE, SCREEN, BgSet, BgLayer, PlanetLayer, PLANET_SPACING, BG_PX_PER_M, PLANET_SPEED, SHAKE_MAX_PX, QUALITY_TIERS, BG_DIM } from '../game/constants';

/**
 * Per-layer scroll period the caller wraps translateY within (so it never grows
 * unbounded): mirrored art repeats every 2 tiles (parity must stay consistent),
 * plain art every tile.
 */
export const bgPeriod = (set: BgSet) => (set.mirror ? 2 : 1) * SCREEN.W * set.aspect;

/**
 * …and the period for ONE layer, which may override the set's tile shape.
 *
 * Layers no longer all share a period: the star veil is a square tile shared by
 * every sky, while the spbg sets tile at 16:9. Wrapping the veil on the set's
 * period would slide it by the wrong distance and tear a visible seam through
 * the stars every cycle.
 */
export const layerPeriod = (set: BgSet, layer: BgLayer) =>
  ((layer.mirror ?? set.mirror) ? 2 : 1) * SCREEN.W * (layer.aspect ?? set.aspect);

/**
 * The drifting cast of distant planets for one environment. Each environment
 * cycles through its list: a planet drifts slowly down, leaves the screen, then
 * after a long empty stretch the next one appears. Mounted once and scrolled on
 * the native side via its own Animated.Value; the strip is a whole number of
 * full cast-cycles tall, so the wrap back to the top is seamless.
 */
function PlanetField({ planet, anim }: { planet: PlanetLayer; anim: Animated.Value }) {
  const len = planet.items.length;
  const period = len * PLANET_SPACING; // one full cycle through the cast
  const copies = Math.ceil(SCREEN.H / PLANET_SPACING) + len + 2;
  return (
    // Clipped for the same reason the wisp layers are: the strip is several
    // screens tall and most of its planets are always scrolled out of view, so
    // bounding it lets the platform drop them instead of walking and
    // compositing them every frame. Inflated by SHAKE_MAX_PX on all sides for
    // the same reason they are — see the note in ParallaxBackground.
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: SCREEN.W + SHAKE_MAX_PX * 2,
        height: SCREEN.H + SHAKE_MAX_PX * 2,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          // Parked one full cycle above; translateY brings it down. SHAKE_MAX_PX
          // re-aligns it to the screen inside the inflated clip.
          top: SHAKE_MAX_PX - period,
          width: SCREEN.W + SHAKE_MAX_PX * 2,
          height: copies * PLANET_SPACING,
          transform: [{ translateY: anim }],
        }}
      >
        {Array.from({ length: copies }, (_, i) => {
          const item = planet.items[((i % len) + len) % len];
          const size = SCREEN.W * item.sizeFrac; // per-planet: bigger reads nearer
          return (
            <Image
              key={i}
              source={item.src}
              resizeMode="contain"
              fadeDuration={0}
              style={{
                position: 'absolute',
                left: SHAKE_MAX_PX + item.xFrac * SCREEN.W - size / 2,
                top: i * PLANET_SPACING - size / 2,
                width: size,
                height: size,
                opacity: item.opacity,
              }}
            />
          );
        })}
      </Animated.View>
    </View>
  );
}

/**
 * One parallax background set, mounted ONCE and scrolled entirely on the native
 * side. The caller advances each layer's translateY through `anims`.
 *
 * Non-seamless art alternates mirrored copies (scaleY: -1 on odd tiles) to hide
 * the seam; the strip is a whole number of tiles so the wrap is invisible.
 * React.memo keeps the whole subtree from reconciling on the parent's per-frame
 * renders (its props — the set and the anim array — are stable for the run).
 */
export const ParallaxBackground = React.memo(function ParallaxBackground({
  set,
  anims,
  planetAnim,
  tier = 0,
}: {
  set: BgSet;
  anims: Animated.Value[];
  planetAnim: Animated.Value;
  /**
   * Adaptive-quality tier, 0 = full detail. Above 0 the sky sheds layers — see
   * QualityTier.bgLayers for why the background in particular. Defaults to full
   * detail so the menus (AmbientParallax), which have no loop measuring frames,
   * are unaffected. A plain number, so React.memo still skips this whole subtree
   * on every frame the tier hasn't actually changed.
   */
  tier?: number;
}) {
  const q = QUALITY_TIERS[Math.min(Math.max(tier, 0), QUALITY_TIERS.length - 1)];
  // Trimmed from the top of the stack (see QualityTier.bgLayers). Never below
  // one — a sky with no layers at all is a bug, not a quality setting.
  const layers = set.layers.slice(0, Math.max(1, Math.min(set.layers.length, q.bgLayers)));
  const planet = q.planets ? set.planet : undefined;
  /**
   * A layer's tile height. Per LAYER rather than per set, so one sky can mix
   * tile shapes — the star veil is a square tile shared by every environment,
   * while the spbg sets tile at 16:9. Still keyed off SCREEN.W, so it agrees
   * with the scroll period layerPeriod() computes for the same layer.
   */
  const tileHOf = (L: BgLayer) => SCREEN.W * (L.aspect ?? set.aspect);
  // The sky is drawn INSIDE the play field's shake layer, so a hard hit slides
  // it by up to SHAKE_MAX_PX and would otherwise pull its own edge into view.
  // Every clip here is inflated by that much on all sides, and the strips inside
  // are pushed back by the same amount so screen alignment is unchanged. Note
  // `tileH` deliberately still keys off SCREEN.W: it sets the scroll period that
  // bgPeriod() and the caller's wrap arithmetic agree on, and must not move.
  const PAD = SHAKE_MAX_PX;
  const CLIP_W = SCREEN.W + PAD * 2;
  const CLIP_H = SCREEN.H + PAD * 2;
  const renderLayer = (L: BgSet['layers'][number], li: number) => {
    // Tile shape is per LAYER now, not per set: the star veil is a square tile
    // shared by every sky, while the spbg sets tile at 16:9. See BgLayer.aspect.
    const tileH = tileHOf(L);
    const tilesNeeded = Math.ceil(SCREEN.H / tileH) + 3;
    const mirror = L.mirror ?? set.mirror;
    const tiles: React.ReactNode[] = [];
    // Tiles are OPAQUE (no per-tile opacity) and overlap by ~1px, so wherever two
    // tiles meet the overlap is fully covered — no hairline gap can flash the
    // black space behind. The layer's real transparency is applied ONCE to the
    // whole group below (opacity on the container). That's the key: fading each
    // tile individually double-darkens the overlap and paints a line every tile;
    // fading the flattened group fades it uniformly, so the seam vanishes.
    const tileFill = Math.ceil(tileH) + 1; // integer height so rounding can't shrink the overlap
    for (let i = 0; i < tilesNeeded; i++) {
      const flipped = mirror && i % 2 === 1;
      tiles.push(
        <Image
          key={i}
          source={L.src}
          resizeMode="stretch"
          fadeDuration={0}
          style={{
            position: 'absolute',
            left: 0,
            top: i * tileH, // exact top → the scroll wrap stays perfectly periodic
            width: CLIP_W, // wide enough to survive a sideways shake
            height: tileFill,
            transform: flipped ? [{ scaleY: -1 }] : undefined,
          }}
        />
      );
    }
    return (
      // A SCREEN-SIZED clip that also carries the layer's alpha.
      //
      // Both jobs belong here rather than on the moving strip below. The strip
      // is `tilesNeeded * tileH` tall — around three screens — and putting
      // group-opacity on it asked the platform for an offscreen buffer that
      // big: on Android that is setLayerType(LAYER_TYPE_HARDWARE), i.e. a
      // persistent texture of roughly 1180×7000px per layer, re-rendered every
      // frame because translateY never stops moving, and large enough on some
      // GPUs to blow past the max texture size and fall back to SOFTWARE
      // rendering. Three of those is most of a weak phone's frame budget, and
      // it costs the same whether the board is empty or full.
      //
      // Clipping first bounds that buffer to one screen and lets the platform
      // cull the tiles that are scrolled off. The alpha still applies ONCE to
      // the flattened group, which is the part that must not regress — fading
      // tiles individually double-darkens every overlap and paints a line at
      // each seam (see the tile comment above).
      <View
        pointerEvents="none"
        needsOffscreenAlphaCompositing={L.alpha < 1}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: CLIP_W,
          height: CLIP_H,
          overflow: 'hidden',
          opacity: L.alpha,
        }}
      >
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            // Strip parked one wrap-period above; translateY brings it down.
            // PAD re-aligns it to the screen inside the inflated clip.
            top: PAD - 2 * tileH,
            width: CLIP_W,
            height: tilesNeeded * tileH,
            transform: [{ translateY: anims[li] }],
          }}
        >
          {tiles}
        </Animated.View>
      </View>
    );
  };
  return (
    // Parked PAD above and left of the screen, so everything inside can be laid
    // out in a coordinate space that already carries the shake margin.
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: -PAD, top: -PAD, width: CLIP_W, height: CLIP_H }}
    >
      {set.base !== undefined && (
        <Image
          source={set.base}
          resizeMode="cover"
          fadeDuration={0}
          style={{ position: 'absolute', left: 0, top: 0, width: CLIP_W, height: CLIP_H }}
        />
      )}
      {layers.map((L, li) => (
        <React.Fragment key={li}>
          {renderLayer(L, li)}
          {/* Planets sit just behind the NEAREST wisp layer: near enough to stay
              clearly visible (even on the near-black void), but with that last
              layer drifting in front for a touch of depth. Keyed off the layers
              actually DRAWN, so a trimmed sky still puts them one from the top
              rather than dropping them off the end of the stack. */}
          {li === Math.max(0, layers.length - 2) && planet && (
            <PlanetField planet={planet} anim={planetAnim} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
});

/**
 * How dark the sky reads behind a menu, in total. Menus carry text, so the sky
 * is pushed back harder there than it is in play.
 */
const MENU_DIM_TOTAL = 0.55;
/**
 * …and the dim actually applied, now that BG_DIM is baked into the art.
 *
 * Derived rather than written as a literal, because the art already carries
 * BG_DIM: applying the full 0.55 on top would stack the two and land the menus
 * far darker than they were. Solving `1 - (1-BG_DIM)(1-d) = MENU_DIM_TOTAL` for
 * the residual keeps the final darkness identical to what shipped, and keeps it
 * identical if either number is ever changed.
 */
const MENU_DIM = 1 - (1 - MENU_DIM_TOTAL) / (1 - BG_DIM);

/** Metres per second the menu sky drifts. Slow — it's a backdrop, not a run. */
const AMBIENT_RATE = 26;
/** One drift cycle, long enough that the wrap is never noticeable. */
const AMBIENT_CYCLE_MS = 90_000;

/**
 * The same sky, drifting on its own for menus and full-screen shells.
 *
 * Driven by ONE looping Animated timing per layer with `useNativeDriver`, not by
 * a render loop: the menu has no game loop to write values from, and a
 * setInterval writing transforms would burn a frame's work on a static screen.
 * Interpolating a single 0→1 driver into each layer's own scroll distance is
 * what keeps the layers at different speeds without a second animation.
 */
export function AmbientParallax({ set, dim = MENU_DIM }: { set: BgSet; dim?: number }) {
  const driver = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(driver, {
        toValue: 1,
        duration: AMBIENT_CYCLE_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [driver]);

  // Built ONCE per background, never per render.
  //
  // These used to be created inline in the render body, which meant every
  // re-render — and App re-renders on any save write, so a banked coin was
  // enough — built four fresh interpolation nodes and orphaned the previous
  // four. The native driver holds its own references to that node graph, so
  // switching background tore down nodes it was still animating and threw
  // "Cannot read property 'forEach' of null" from deep inside Animated.
  //
  // The `key` at the call site (App.tsx) means `set` cannot actually change
  // within one mount; this memo is what guarantees the nodes are stable for the
  // re-renders that DO happen.
  const { layerAnims, planetAnim } = useMemo(() => {
    const metres = (AMBIENT_CYCLE_MS / 1000) * AMBIENT_RATE;
    const layers = set.layers.map((L) => {
      // Per LAYER: a set can mix tile shapes now (see BgLayer.aspect), and
      // wrapping a square veil on a 16:9 period tears a seam every cycle.
      const period = layerPeriod(set, L);
      const distance = metres * BG_PX_PER_M * L.speed;
      // Wrap to a whole number of periods so the loop restart is invisible.
      const wrapped = Math.max(1, Math.round(distance / period)) * period;
      return driver.interpolate({
        inputRange: [0, 1],
        outputRange: [0, wrapped],
      }) as unknown as Animated.Value;
    });
    const planetPeriod = set.planet ? set.planet.items.length * PLANET_SPACING : 1;
    const planetWrapped =
      Math.max(1, Math.round((metres * BG_PX_PER_M * PLANET_SPEED) / planetPeriod)) * planetPeriod;
    return {
      layerAnims: layers,
      planetAnim: driver.interpolate({
        inputRange: [0, 1],
        outputRange: [0, planetWrapped],
      }) as unknown as Animated.Value,
    };
  }, [set, driver]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <ParallaxBackground set={set} anims={layerAnims} planetAnim={planetAnim} />
      {/* Menus carry text, so the sky is dimmed harder than it is in play. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: PALETTE.void, opacity: dim }]} />
    </View>
  );
}
