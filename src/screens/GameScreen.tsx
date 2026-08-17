import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, PanResponder, Pressable, AppState, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import ObstacleView from '../components/Obstacle';
import ParticleLayer from '../components/ParticleLayer';
import PerfOverlay, { newPerfStats, nowMs } from '../components/PerfOverlay';
import { ParallaxBackground, layerPeriod } from '../components/Parallax';
import { FONTS, TYPE } from '../game/type';
import Icon from '../components/Icon';
import { LowHullPulse, useReduceMotion } from '../components/Motion';
import {
  FloatTextView,
  HUD,
  HealthBar,
  SpecialButton,
  WaveHeader,
  BossBar,
  boonChipKey,
} from '../components/Effects';
import { Card, Bullet, EnemyBullet, GunKind, SpecialKind, GameState, RunResult } from '../game/types';
import { play, playPop, playKill, playShot, playGraze } from '../game/sounds';
// Every haptic in the run goes through this budget rather than at the motor
// directly — see haptics.ts for why a graze storm was drowning out damage.
import { haptic, hapticFailure, HapticWeight } from '../game/haptics';
import {
  addChain,
  breakChain,
  calloutFor,
  chainWindowFrac,
  grazeChain,
  isGrazing,
  killScore,
  multiplierFor,
  ribbonTotal,
  ribbonsFor,
  GRAZE_VALUE,
  SCORE_ELITE,
  SCORE_ENEMY,
  SCORE_GIANT_BOSS,
  SCORE_MINI_BOSS,
  tickChain,
} from '../game/chain';
import {
  SCREEN,
  LANES,
  laneX,
  FEED_PAD,
  AVATAR_SIZE,
  OB_VIS,
  OB_HIT,
  BASE_SPEED,
  MAX_SPEED,
  HEART_EVERY,
  PICKUP_FALL_SCALE,
  COIN_EVERY,
  COIN_GOLD,
  COIN_VIS,
  COIN_DROP_SPACING,
  COIN_DROP_RELEASE,
  COIN_DROP_EVERY,
  BOSS_MINI_COINS,
  BOSS_GIANT_COINS,
  RAMP_ALT,
  ALT_RATE_MIN,
  ALT_RATE_MAX,
  BOMB_FIRE_RATE,
  BULLET_SPEED,
  BULLET_DMG,
  BOMB_DMG,
  BOMB_SPLASH_DMG,
  BOMB_SPLASH_RADIUS,
  LASER_FIRE_RATE,
  LASER_DMG,
  LASER_LEN,
  ROCKET_FIRE_RATE,
  ROCKET_DMG,
  ROCKET_SPEED,
  GUN_TIME,
  GIFT_EVERY,
  MAX_GUN_LEVEL,
  ENEMY_FIRE_EVERY,
  ENEMY_BULLET_SPEED,
  ZIGZAG_WAVE,
  HOMING_WAVE,
  CHARGE_WAVE,
  ENEMY_BULLET_SIZE,
  MAX_ENEMY_BULLETS,
  MAX_FLOATS,
  ZIG_AMP,
  ZIG_FREQ,
  ENEMY_HOMING_SPEED,
  ENEMY_HOMING_TURN,
  ENEMY_HOMING_DISLOCK,
  ENEMY_BULLET_LIFE,
  ENEMY_HOMING_LIFE,
  CHARGE_SPEED,
  WAVE_COLORS,
  FORMATION_TOP,
  FORMATION_ROW_GAP,
  WAVE_GAP,
  WAVE_BASE_ENEMIES,
  WAVE_MAX_ENEMIES,
  BgSet,
  BG_PX_PER_M,
  SHAKE_AMP,
  SHAKE_REF,
  SHAKE_MAX,
  SHAKE_ABSORB,
  SHAKE_MAX_PX,
  PLANET_SPEED,
  PLANET_SPACING,
  shipForWave,
  BOSS_MINI_HIT,
  BOSS_GIANT_HIT,
  BOSS_MINI_HP,
  BOSS_GIANT_HP,
  SHOT_HOMING_IMG,
  SHOT_BOMB_IMG,
  SHOT_LASER_IMG,
  SHOT_BOMB_W,
  SHOT_BOMB_H,
  SHOT_LASER_LEN,
  SHOT_LASER_THICK,
  SHOT_HOMING_LEN,
  SHOT_HOMING_THICK,
  enemyShotBox,
  AVATAR_IMG_W,
  AVATAR_IMG_H,
  ENEMY_SHOTS,
  ENEMY_SHOT_ASPECT,
  enemyShotFor,
  PLAYER_SHOT_LEN,
  ShotArt,
  GUN_LABEL,
  PALETTE,
  SPECIALS,
  PHANTOM_TIME,
  PHANTOM_OFFSET,
  PHANTOM_ALPHA,
  PHANTOM_TINT,
  TALON_COUNT,
  TALON_SPREAD,
  TALON_SPEED,
  TALON_DMG,
  TALON_LEN,
  TALON_THICK,
  TALON_PAD,
  TALON_BURST_TIME,
  TALON_BURST_EVERY,
  TALON_SWEEP_AMP,
  TALON_SWEEP_FREQ,
  NOVA_SPEED,
  NOVA_RADIUS,
  NOVA_DMG,
  NOVA_THICK,
  NOVA_RING_BASE,
  NOVA_FLASH_COLOR,
  NOVA_FLASH_ALPHA,
  NOVA_FLASH_R,
  NOVA_CORE_FRAC,
  NOVA_CORE_COLOR,
  NOVA_CORE_ALPHA,
  NOVA_CORE_R,
  BURST_MAX,
  QUALITY_TIERS,
  FRAME_BUDGET_MS,
  QUALITY_SAMPLE,
  QUALITY_DROP_FRAC,
  QUALITY_RAISE_FRAC,
  PERF_OVERLAY,
  EXPLOSION_SHEETS,
  EXPLOSION_FRAMES,
  EXPLOSION_FPS,
  EXPLOSION_LIFE,
  EXPLOSION_VIS,
  EXPLOSION_BOSS,
  EXPLOSION_BOSS_SCALE,
  explosionForShip,
  EFFECT_LOAD_LOW,
  EFFECT_LOAD_HIGH,
  EFFECT_MIN_SCALE,
  SPEAR_COUNT,
  SPEAR_SPEED,
  SPEAR_DMG,
  SPEAR_LEN,
  SPEAR_THICK,
  SPEAR_DROP_BAND,
  SPEAR_SPEED_VAR,
  SPEAR_TILT,
  SPEAR_RELEASE,
  SPEAR_RELEASE_EVERY,
  CRIT_COLOR,
  BOON_EVERY,
  BOMB_FLASH_TIME,
  BOMB_FLASH_COLOR,
  BOMB_FLASH_ALPHA,
  BOMB_BTN_SIZE,
  BOMB_BTN_LEFT,
  BOMB_BTN_BOTTOM,
  VOLLEY_DAMPEN,
  SHIELD_RING,
  SHIELD_COLOR,
  SHIELD_HITS,
  AVATAR_HULL_CY,
  AVATAR_HIT_W,
  AVATAR_HIT_H,
  AVATAR_ART_SCALE,
  AVATAR_ART_DX,
  AVATAR_ART_DY,
  ENERGY_PER_KILL,
  ENERGY_PER_ELITE,
  ENERGY_PER_BOSS,
  ENERGY_PER_GRAZE,
  ENERGY_PER_FLAWLESS_WAVE,
  ENERGY_IDLE_PER_SEC,
  ENERGY_OVERCHARGE,
  OVERCHARGE_EDGE,
  HITSTOP_KILL,
  HITSTOP_ELITE,
  HITSTOP_BOSS_PHASE,
  HITSTOP_BOSS_KILL,
  HITSTOP_MAX,
  CHAIN_HUD_COLOR,
  CHAIN_HUD_HOT,
  BULWARK_TIME,
  BULWARK_TIME_OVER,
  BULWARK_RING,
  BULWARK_COLOR,
  BULWARK_CORE,
  BULWARK_REFLECT_DMG,
  BULWARK_REFLECT_MAX,
  BULWARK_REFLECT_SPEED,
} from '../game/constants';
import { ShipStats, rollDamage } from '../game/upgrades';
// The canonical initial run state lives in the game layer (runstate.ts) so the
// loop, the pause screen's NEW GAME and the test suite all build on ONE
// definition instead of three drifting copies.
import { freshRunState as fresh } from '../game/runstate';
import {
  BOONS,
  BoonKind,
  MAGNET_PULL,
  MAGNET_RADIUS,
  EXTRA_HEART_CEILING,
  applyTimedBoon,
  boonActive,
  coinValue,
  damageMult,
  enemiesFrozen,
  enemyBulletMult,
  fireIntervalMult as boonFireMult,
  isInstant,
  isShielded,
  rollBoon,
  tickBoons,
} from '../game/pickups';
import { bossFire, bossSway, bossPhaseIndex } from '../game/bosses';
import {
  ARCHETYPES,
  ELITES,
  EnemyShotSpec,
  applyArchetype,
  baseWaveHp,
  bountyOf,
  descendSpeed,
  enemyFire,
  explosiveBurst,
  rollArchetype,
  rollElite,
  splitChildren,
  stepEnemy,
} from '../game/enemies';

interface Props {
  best: number;
  /** require()'d avatar art. Every hull has one — see AvatarDef.image. */
  avatarImage: number;
  avatarShot: ShotArt; // the selected ship's signature fire-shot art
  avatarSpecial: SpecialKind; // its FIRE-button ultimate ('none' on the free ship)
  /**
   * The equipped hull's permanent upgrades, already resolved to flat numbers
   * (see upgrades.ts). The loop reads these instead of the raw constants, so a
   * hull with nothing bought plays exactly as it always did.
   */
  shipStats: ShipStats;
  background: BgSet; // the one environment shown for the whole run
  resume?: GameState | null; // restore an in-progress run instead of starting fresh
  startPaused?: boolean; // resumed runs open on the pause screen
  onGameOver: (result: RunResult) => void;
  onPersist: (state: GameState) => void; // snapshot the run (pause / background / home)
  onClearRun: () => void; // discard the saved run (new game / game over)
  onHome: () => void; // leave to the main menu
}

const GIFT_GUNS: GunKind[] = ['double', 'bomb', 'laser', 'homing'];

const isHazard = (c: Card) => !c.dead && c.kind === 'rage';

// Effective center x: a charging enemy moves freely; otherwise it's lane-locked.
const cardX = (c: Card) => c.cx ?? laneX(c.lane);

/**
 * Where the player IS — the centre of the drawn hull.
 *
 * One definition for every consumer: the hurtbox, what enemies aim at, what a
 * rocket tracks, what a charger dives at, what a magnet pulls toward, and where
 * hull effects originate. These all used `avatarY + AVATAR_SIZE / 2`, the
 * HITBOX centre, which sits ~15px below the sprite — so enemies aimed under the
 * ship and the box that caught their shots was hanging below it to match.
 *
 * Both halves have to move together. Recentring the hurtbox while leaving the
 * aim points where they were would make aimed fire systematically miss.
 */
const hullY = (s: GameState) => s.avatarY + AVATAR_HULL_CY;

// The hazard closest to the player (largest y still above the given point),
// optionally skipping ones another rocket has already locked onto.
function nearestHazard(cards: Card[], belowY: number, exclude?: Set<number>): Card | undefined {
  let best: Card | undefined;
  for (const c of cards) {
    if (!isHazard(c) || c.y + c.h > belowY) continue;
    if (exclude?.has(c.id)) continue;
    if (!best || c.y > best.y) best = c;
  }
  return best;
}

// Hazards ordered nearest-to-player first, so a homing volley can hand each
// rocket its own target instead of dogpiling one enemy.
function hazardsByProximity(cards: Card[], belowY: number): Card[] {
  return cards.filter((c) => isHazard(c) && c.y + c.h <= belowY).sort((a, b) => b.y - a.y);
}

/**
 * Everything the enemy-shot render needs that can be derived once at spawn.
 *
 * The sprite's heading and its drawn box were being recomputed for every live
 * shot on every frame — an atan2, a divide and a fresh `{w,h}` object each, at
 * up to MAX_ENEMY_BULLETS × 60 a second. None of it changes while the shot
 * flies: `size` is fixed, and velocity is constant for every kind EXCEPT
 * homing (zigzag sways its POSITION, not its velocity, so its heading is
 * constant too). The homing branch of the update loop refreshes `angle` itself.
 *
 * Missiles point UP in the source art, so the nose (0,-1) maps onto the
 * velocity as atan2(vx, -vy) — e.g. straight down is 180°.
 */
function enemyShotRender(
  vx: number,
  vy: number,
  size: number,
  shot?: number
): { angle: number; bw: number; bh: number } {
  const idx = shot ?? -1;
  const box = idx < 0 ? { w: size, h: size } : enemyShotBox(size, ENEMY_SHOT_ASPECT[idx]);
  return { angle: (Math.atan2(vx, -vy) * 180) / Math.PI, bw: box.w, bh: box.h };
}

const SPACE_BLACK = PALETTE.void;

// The play field's transform while nothing is shaking — which is nearly every
// frame of a run. Frozen and shared so the prop is reference-identical frame to
// frame and the platform can skip it, instead of allocating an identical array
// sixty times a second for the whole run.
const NO_SHAKE = [{ translateX: 0 }, { translateY: 0 }];

// Render cap. On a 90/120 Hz Android, requestAnimationFrame fires 90–120×/sec,
// so the game would simulate and repaint that often — double the work and heat
// of a 60 Hz phone for no visible gain. We skip vsyncs that arrive sooner than
// this. The threshold sits safely under a 60 Hz frame (16.67 ms) so a true
// 60 Hz display (e.g. the iPhone 16) never drops a frame; only faster panels
// are throttled back toward ~60 fps.
const FRAME_MIN_MS = 1000 / 70;

// Off-screen pre-warm: mount every projectile sprite once at its in-game size
// so the native image cache is hot before the first shot (a cold Image view can
// take frames to fetch/decode, which made fast bullets invisible near the ship).
// Static for the run → memoized so it never reconciles on the per-frame render.
const Prewarm = React.memo(function Prewarm({
  avatarShot,
  special,
}: {
  avatarShot: ShotArt;
  special: SpecialKind;
}) {
  const shotThick = PLAYER_SHOT_LEN * avatarShot.aspect;
  return (
    <View pointerEvents="none" style={styles.prewarm}>
      <Image source={avatarShot.src} fadeDuration={0} style={{ width: shotThick, height: PLAYER_SHOT_LEN }} />
      {/* Talons and spears restyle this same bolt at a very different size, and
          a bitmap warmed at one size can decode again at another — so warm the
          equipped ship's special shape too, or its first (and biggest) strike
          paints late. */}
      {special === 'talons' && (
        <Image source={avatarShot.src} fadeDuration={0} style={{ width: TALON_THICK, height: TALON_LEN }} />
      )}
      {special === 'spears' && (
        <Image source={avatarShot.src} fadeDuration={0} style={{ width: SPEAR_THICK, height: SPEAR_LEN }} />
      )}
      <Image source={SHOT_HOMING_IMG} fadeDuration={0} style={{ width: SHOT_HOMING_LEN, height: SHOT_HOMING_THICK }} />
      <Image source={SHOT_BOMB_IMG} fadeDuration={0} style={{ width: SHOT_BOMB_W, height: SHOT_BOMB_H }} />
      <Image source={SHOT_LASER_IMG} fadeDuration={0} style={{ width: SHOT_LASER_LEN, height: SHOT_LASER_THICK }} />
      {ENEMY_SHOTS.map((src, i) => (
        <Image
          key={i}
          source={src}
          fadeDuration={0}
          style={{
            width: enemyShotBox(ENEMY_BULLET_SIZE, ENEMY_SHOT_ASPECT[i]).w,
            height: enemyShotBox(ENEMY_BULLET_SIZE, ENEMY_SHOT_ASPECT[i]).h,
          }}
        />
      ))}
    </View>
  );
});

// Nova's shockwave. Drawn once at NOVA_RING_BASE and moved/stretched/faded
// entirely through Animated.Values the loop writes with setValue() — so the
// wave costs no React render and no re-layout while it travels. Mounted for the
// whole run (and only on the ship that can fire one), parked at opacity 0 when
// idle, so the rounded border is rasterized a single time instead of per frame.
const NOVA_CORE_BASE = NOVA_RING_BASE * NOVA_CORE_FRAC;

const NovaRing = React.memo(function NovaRing({
  x,
  y,
  scale,
  opacity,
  core,
}: {
  x: Animated.Value;
  y: Animated.Value;
  scale: Animated.Value;
  opacity: Animated.Value;
  core: Animated.Value;
}) {
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: NOVA_RING_BASE,
        height: NOVA_RING_BASE,
        // Translate first, then scale about the view's own center, so the blast
        // stays centered on the point it went off at as it grows. Ring and core
        // ride the same transform — one scale drives both.
        transform: [{ translateX: x }, { translateY: y }, { scale }],
      }}
    >
      {/* The fireball, on its own faster fade so it burns out while still small. */}
      <Animated.View
        style={{
          position: 'absolute',
          left: (NOVA_RING_BASE - NOVA_CORE_BASE) / 2,
          top: (NOVA_RING_BASE - NOVA_CORE_BASE) / 2,
          width: NOVA_CORE_BASE,
          height: NOVA_CORE_BASE,
          borderRadius: NOVA_CORE_BASE / 2,
          backgroundColor: NOVA_CORE_COLOR,
          opacity: core,
        }}
      />
      {/* The shockwave itself, outrunning the fireball. */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: NOVA_RING_BASE,
          height: NOVA_RING_BASE,
          borderRadius: NOVA_RING_BASE / 2,
          borderWidth: NOVA_THICK,
          borderColor: PALETTE.gold,
          opacity,
        }}
      />
    </Animated.View>
  );
});

// The detonation's whiteout. Deliberately a sibling of the shake layer rather
// than a child: shaking a full-screen overlay would drag its edges inward and
// leave unlit strips down the sides of the screen.
const NovaFlash = React.memo(function NovaFlash({ opacity }: { opacity: Animated.Value }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.novaFlash, { opacity }]}
    />
  );
});

// The bomb's detonation whiteout. Same reasoning as NovaFlash: a single flat
// full-screen quad whose opacity the loop writes natively, so the biggest part
// of the effect costs nothing per frame. Mounted for the run at opacity 0.
const BombFlash = React.memo(function BombFlash({ opacity }: { opacity: Animated.Value }) {
  return <Animated.View pointerEvents="none" style={[styles.bombFlash, { opacity }]} />;
});

// The bomb bay. Memoized on the count alone, so it reconciles when a bomb is
// spent or picked up — not on the parent's per-frame render.
const BombButton = React.memo(function BombButton({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  const empty = count <= 0;
  return (
    <Pressable
      testID="bomb"
      onPress={onPress}
      disabled={empty}
      hitSlop={8}
      style={({ pressed }) => [
        styles.bombBtn,
        empty && styles.bombBtnEmpty,
        pressed && styles.bombPressed,
      ]}
    >
      <Icon name="bomb" size={22} color={empty ? PALETTE.inkMute : PALETTE.amber} />
      <Text style={[styles.bombCount, empty && styles.bombCountEmpty]}>{count}</Text>
    </Pressable>
  );
});

// Ironclad's shell, drawn around the hull while BULWARK holds. Thicker and
// brighter than the shield boon's hoop, because it does more: it eats fire and
// throws it back.
function BulwarkShell({ x, y, time, over }: { x: number; y: number; time: number; over: boolean }) {
  const d = BULWARK_RING * (over ? 1.12 : 1);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: d,
        height: d,
        borderRadius: d / 2,
        borderWidth: 3.5,
        borderColor: BULWARK_COLOR,
        backgroundColor: BULWARK_CORE,
        // Thins out over the last second as a warning that it's about to drop.
        opacity: Math.min(1, time) * 0.9,
        transform: [{ translateX: x - d / 2 }, { translateY: y - d / 2 }],
      }}
    />
  );
}

// --- Why everything below is placed with `transform`, never `left`/`top` -----
//
// Every entity on the board moves every frame. `left`/`top` are LAYOUT props:
// writing them marks the node dirty and Yoga re-measures it (and its subtree)
// on every commit. At a busy moment — 40 player shots, 40 enemy shots, a full
// formation, floats and fireballs — that was 80-120 layout passes per frame,
// roughly 6000 a second, all to move boxes whose size never changed.
//
// A transform is the one thing a view can change without re-running layout. So
// each entity mounts as a fixed-size box at the origin (left: 0, top: 0) and is
// moved by translateX/translateY instead. Rotation and scale still come AFTER
// the translation in the array, which keeps them about the view's own centre —
// exactly what left/top + rotate did before, so nothing moves differently.
//
// This is the same trick ParticleLayer uses for the spark field, and for the
// same reason; it just never reached the sprites.

export default function GameScreen({
  best,
  avatarImage,
  avatarShot,
  avatarSpecial,
  shipStats,
  background,
  resume,
  startPaused,
  onGameOver,
  onPersist,
  onClearRun,
  onHome,
}: Props) {
  // Merge onto a fresh state so runs saved by an older build (missing newer
  // fields like enemyBullets or the boon record) don't crash on resume.
  // Bomb capacity is deliberately re-read from the CURRENT hull rather than
  // trusted from the snapshot: the player may have bought a Bomb Bay level
  // while the run sat paused, and a stale cap would silently cancel it.
  const g = useRef<GameState>(
    resume
      ? {
          ...fresh(shipStats),
          ...resume,
          bombCap: shipStats.bombCapacity,
          bombs: Math.min(resume.bombs ?? shipStats.bombCapacity, shipStats.bombCapacity),
          // A run saved before the shield had a hit budget carries a live shield
          // boon and no `shieldLeft`, which would spread to 0 and leave the hoop
          // drawn but inert — the worst possible state, because it looks like
          // protection. Shattering DELETES the boon, so "active with no budget"
          // is unreachable in play and safe to read as "pre-budget snapshot".
          shieldLeft:
            resume.shieldLeft ?? (boonActive(resume.boons, 'shield') ? SHIELD_HITS : 0),
        }
      : fresh(shipStats)
  );
  // One Animated.Value per background layer, driving that layer's scroll. The
  // loop calls setValue() each frame, which moves the native transform without
  // a React re-render. Stable for the run (the run's background never changes),
  // so <ParallaxBackground> stays memoized.
  const bgAnims = useRef<Animated.Value[]>(background.layers.map(() => new Animated.Value(0)));
  // Drives the far planet's slow drift (same native-scroll trick as the layers).
  const planetAnim = useRef(new Animated.Value(0));
  // The FIRE meter, driven the same way: the loop writes this 0..1 charge (and
  // the ready-state throb) straight to the native view, so a meter that moves
  // every frame costs no React renders. The button turns the one value into
  // both its level and its colour. Seeded from a resumed run — every hull has a
  // special now, so there is no longer a case where a stored charge has to be
  // discarded.
  const chargeAnim = useRef(new Animated.Value(resume?.specialCharge ?? 0));
  const specialPulse = useRef(new Animated.Value(1));
  // Nova's shockwave: position, size and fade, all driven natively (see NovaRing).
  const novaAnim = useRef({
    x: new Animated.Value(0),
    y: new Animated.Value(0),
    scale: new Animated.Value(0),
    opacity: new Animated.Value(0),
    core: new Animated.Value(0),
    flash: new Animated.Value(0),
  });
  // Assigned inside the loop effect (like resumeLoopRef) so the button's press
  // handler can reach the spawn helpers that live in that closure.
  const fireSpecialRef = useRef<() => void>(() => {});
  const detonateRef = useRef<() => void>(() => {});
  // The bomb blast's whiteout, driven natively for the same reason Nova's is:
  // a full-screen flat quad at an animated opacity costs nothing per frame.
  const bombFlashAnim = useRef(new Animated.Value(0));
  // Latest resolved upgrades, readable from inside the loop closure (which is
  // created once and must not capture a stale stat block if the player buys an
  // upgrade, returns home, and resumes).
  const statsRef = useRef(shipStats);
  statsRef.current = shipStats;
  // This frame's camera-shake offset, rolled by the loop and read by the render.
  // A ref, not state: it changes every frame during a hit and must never cause a
  // render of its own. Not on GameState either — it is transient presentation,
  // not something a resumed run should restore mid-jolt.
  const shakeOffset = useRef({ x: 0, y: 0 });
  const overRef = useRef(false);
  const pausedRef = useRef(!!startPaused);
  const [paused, setPaused] = useState(!!startPaused);
  const resumeLoopRef = useRef<() => void>(() => {});
  const [, setFrame] = useState(0);
  const reduceMotion = useReduceMotion();
  // Profiling scratch — written by the loop, read by <PerfOverlay> on its own
  // slow interval. A ref rather than state: the whole point is that measuring
  // must not itself cause a render.
  // Live adaptive-quality tier. Written by the governor in the loop, read by
  // the loop's effect budgets AND by the render, which hands it to the sky.
  const qTierRef = useRef(0);
  const perf = useRef(newPerfStats());
  const renderStart = useRef(0);
  if (PERF_OVERLAY) renderStart.current = nowMs();
  useEffect(() => {
    // No dep array: this has to close the timing on EVERY commit. The effect
    // fires after the commit lands, so the span covers render + commit.
    if (PERF_OVERLAY) perf.current.renderMs = nowMs() - renderStart.current;
  });

  const doPause = useCallback(() => {
    if (pausedRef.current || overRef.current) return;
    pausedRef.current = true;
    g.current.dragging = false;
    setPaused(true);
    onPersist(g.current);
  }, [onPersist]);

  const doContinue = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    resumeLoopRef.current();
  }, []);

  const doNewGame = useCallback(() => {
    g.current = fresh(shipStats);
    overRef.current = false;
    pausedRef.current = false;
    // The meter and the shockwave are native-side state, so a fresh run has to
    // clear them by hand.
    chargeAnim.current.setValue(0);
    specialPulse.current.setValue(1);
    novaAnim.current.opacity.setValue(0);
    setPaused(false);
    onClearRun();
    resumeLoopRef.current();
  }, [onClearRun, shipStats]);

  // Stable handler — keeps <SpecialButton> memoized across the per-frame render.
  const doSpecial = useCallback(() => {
    fireSpecialRef.current();
  }, []);

  // Same pattern as the special: the bomb button seeds state from outside the
  // loop, and the next update() pass resolves the blast.
  const doBomb = useCallback(() => {
    detonateRef.current();
  }, []);

  const doHome = useCallback(() => {
    pausedRef.current = true;
    onPersist(g.current);
    onHome();
  }, [onPersist, onHome]);

  // Closing / backgrounding the app pauses and snapshots the run so it can be
  // resumed on next launch.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active' && !overRef.current && !pausedRef.current) {
        pausedRef.current = true;
        g.current.dragging = false;
        setPaused(true);
        onPersist(g.current);
      }
    });
    return () => sub.remove();
  }, [onPersist]);

  // --- Steering: touch ANYWHERE, and the hull follows your finger ------------
  //
  // Touching the rocket itself is not required. A touch anywhere on the play
  // field grabs it, and it then tracks your finger's MOVEMENT — not your
  // finger's position.
  //
  // That distinction is the whole control scheme, so it's worth being explicit
  // about why it isn't the more obvious "put the ship under the finger":
  //
  //   - The ship would teleport on every touch. Tapping anywhere to reposition
  //     your grip would yank the hull across the board, very often straight into
  //     fire it had already dodged. In a game where one contact costs a heart
  //     that is the single worst thing an input scheme can do.
  //   - Your thumb would cover the thing you are trying to aim. On a phone the
  //     hull is roughly a fingertip wide.
  //
  // Tracking movement instead means the grab offset is whatever it happens to
  // be, the hull never jumps, and you can steer from a corner of the screen
  // where your hand isn't in the way — which is why this is what the genre
  // settled on.
  //
  // `dragDX`/`dragDY` already existed for exactly this; the only thing that
  // used to stand in the way was a GRAB_RADIUS test that required the touch to
  // land within 80px of the hull.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !pausedRef.current,
      onMoveShouldSetPanResponder: () => !pausedRef.current,
      onPanResponderGrant: (evt) => {
        const s = g.current;
        const { pageX, pageY } = evt.nativeEvent;
        s.dragging = true;
        // The offset the hull holds for the life of this drag. Taken from
        // wherever the finger landed, so the hull stays exactly where it is.
        s.dragDX = s.avatarX - pageX;
        s.dragDY = s.avatarY - pageY;
        s.targetX = s.avatarX;
        s.targetY = s.avatarY;
        // Deliberately no sound or haptic on grab. Both used to confirm "you
        // caught the ship" — real information back when a grab could MISS. It
        // can't any more, so the same cue would fire on every incidental touch
        // of the screen while telling the player nothing. The hull tilting and
        // moving under the finger is the confirmation.
      },
      onPanResponderMove: (evt) => {
        const s = g.current;
        if (!s.dragging) return;
        s.targetX = evt.nativeEvent.pageX + s.dragDX;
        s.targetY = evt.nativeEvent.pageY + s.dragDY;
      },
      onPanResponderRelease: () => {
        g.current.dragging = false;
      },
      onPanResponderTerminate: () => {
        g.current.dragging = false;
      },
    })
  ).current;

  useEffect(() => {
    let raf = 0;
    let last = 0;

    // --- Adaptive quality --------------------------------------------------
    // The live tier, and the sample it is decided from. Plain closure state
    // rather than a ref: everything that reads it (burst, playExplosion,
    // effectScale) lives in this same closure, and it must never cause a render.
    // Held in a ref, not a plain closure variable: the RENDER needs it too, to
    // tell the sky how many layers to draw. Still never causes a render of its
    // own — the frame after a tier change picks it up.
    const qTier = qTierRef;
    let sampleFrames = 0;
    let sampleOver = 0;

    const tick = (now: number) => {
      if (overRef.current || pausedRef.current) return;
      // Keep the loop alive first, then decide whether this vsync earns a step.
      raf = requestAnimationFrame(tick);
      if (!last) {
        last = now;
        return;
      }
      // High-refresh cap: skip vsyncs that arrive faster than ~60 fps so a
      // 90/120 Hz panel doesn't simulate and repaint twice as often (and run
      // twice as hot) as a 60 Hz one.
      if (now - last < FRAME_MIN_MS) return;
      // The interval actually delivered. This is the number the governor judges
      // on, because it is the only one that includes EVERYTHING — the sim, the
      // React commit, native layout and the GPU. Timing our own JS would miss
      // the case where JS is fast and the phone is simply fill-rate bound.
      const frameMs = now - last;
      const dt = Math.min(frameMs / 1000, 0.05);
      last = now;

      const simStart = PERF_OVERLAY ? nowMs() : 0;
      update(dt);

      // --- Quality governor ------------------------------------------------
      // Decided over a window rather than per frame: a single long frame is
      // noise (a wave spawning, a sound loading), a third of a window's worth
      // is a device that cannot hold the target and needs less to draw.
      sampleFrames += 1;
      if (frameMs > FRAME_BUDGET_MS) sampleOver += 1;
      if (sampleFrames >= QUALITY_SAMPLE) {
        const overFrac = sampleOver / sampleFrames;
        if (overFrac >= QUALITY_DROP_FRAC && qTier.current < QUALITY_TIERS.length - 1) {
          qTier.current += 1;
        } else if (overFrac <= QUALITY_RAISE_FRAC && qTier.current > 0) {
          qTier.current -= 1;
        }
        sampleFrames = 0;
        sampleOver = 0;
      }

      if (PERF_OVERLAY) {
        const s = g.current;
        const p = perf.current;
        p.frameMs = frameMs;
        p.simMs = nowMs() - simStart;
        p.cards = s.cards.length;
        p.bullets = s.bullets.length;
        p.enemyBullets = s.enemyBullets.length;
        p.particles = s.particles.length;
        p.explosions = s.explosions.length;
        p.tier = qTier.current;
      }
      setFrame((f) => f + 1);
    };

    // Called to (re)start the loop after a pause; resets dt so no time jump.
    resumeLoopRef.current = () => {
      last = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    /**
     * How much of a requested effect the board can currently afford, 1 → floor.
     *
     * Read off the live entity count, because that is what actually costs the
     * frame. A kill on an empty screen is free; the same kill under a full
     * formation that is all shooting is not, and that is precisely the case
     * where a burst was adding the most work.
     */
    const effectScale = (): number => {
      const s = g.current;
      const load = s.cards.length + s.bullets.length + s.enemyBullets.length;
      // Two independent throttles, multiplied: what's on screen right now, and
      // what this DEVICE has been managing. The first is instant and local, the
      // second is slow and global — a phone that keeps missing the budget gets
      // smaller effects even on a quiet screen.
      const q = QUALITY_TIERS[qTier.current].burst;
      if (load <= EFFECT_LOAD_LOW) return q;
      if (load >= EFFECT_LOAD_HIGH) return EFFECT_MIN_SCALE * q;
      const t = (load - EFFECT_LOAD_LOW) / (EFFECT_LOAD_HIGH - EFFECT_LOAD_LOW);
      return (1 - (1 - EFFECT_MIN_SCALE) * t) * q;
    };

    const burst = (x: number, y: number, color: string, count = 10) => {
      const s = g.current;
      // Clamp to the live-particle ceiling AND to what this frame can afford: a
      // Nova can resolve a whole formation in one breath, and each spark is a
      // view the pool has to write every frame it lives.
      // Three ceilings, and they catch different things: the per-event cap is
      // instant, the board-load scale is local, the tier is the device's.
      const want = Math.max(1, Math.min(BURST_MAX, Math.round(count * effectScale())));
      const n = Math.min(want, QUALITY_TIERS[qTier.current].particles - s.particles.length);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 90 + Math.random() * 190;
        s.particles.push({
          id: s.nextId++,
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 60,
          life: 0.4 + Math.random() * 0.3,
          color,
          size: 4 + Math.random() * 5,
        });
      }
    };

    /**
     * Play a death animation at a point, in the dead hull's colour family.
     *
     * Capped rather than unbounded: past MAX_EXPLOSIONS the oldest is dropped,
     * because ten overlapping fireballs is a white rectangle, not an effect.
     */
    const playExplosion = (x: number, y: number, style: number, size: number) => {
      const s = g.current;
      // `while`, not `if`: the governor can lower the ceiling below what is
      // already burning, and the excess has to drain rather than sit there.
      const cap = QUALITY_TIERS[qTier.current].explosions;
      while (s.explosions.length >= cap) s.explosions.shift();
      s.explosions.push({ id: s.nextId++, x, y, t: 0, style, size });
    };

    /**
     * Push a floating readout, recycling the oldest past MAX_FLOATS.
     *
     * The ONLY path that may append to s.floats — a <Text> is the priciest view
     * the renderer makes, and a screen-clearing special pays one per kill on a
     * single frame. Keeping the cap in one place is what stops that being
     * reintroduced by the next call site that wants a number on screen.
     */
    const float = (x: number, y: number, text: string, color: string, life = 0.8) => {
      const s = g.current;
      // `while`, not `if`: mirrors playExplosion, and drains correctly however
      // many are somehow over the line.
      while (s.floats.length >= MAX_FLOATS) s.floats.shift();
      s.floats.push({ id: s.nextId++, x, y, text, color, life });
    };

    // --- Energy, score and hit-stop ----------------------------------------

    /**
     * Add earned energy, scaled by the hull's Energy Cell track, and push it to
     * the native meter. Clamped to the overcharge ceiling so banking has a
     * defined limit rather than growing forever.
     */
    const addEnergy = (amount: number) => {
      const s = g.current;
      if (amount <= 0) return;
      const before = s.specialCharge;
      s.specialCharge = Math.min(ENERGY_OVERCHARGE, s.specialCharge + amount * statsRef.current.energyMult);
      chargeAnim.current.setValue(s.specialCharge);
      // Announce the moment it arms, once — it's the cue to make a decision.
      if (before < 1 && s.specialCharge >= 1) {
        play('ding', 0.5);
        float(s.avatarX, s.avatarY - 74, `${SPECIALS[avatarSpecial].name} READY`, PALETTE.gold);
      } else if (before < ENERGY_OVERCHARGE && s.specialCharge >= ENERGY_OVERCHARGE) {
        play('ding', 0.75);
        float(s.avatarX, s.avatarY - 74, 'OVERCHARGED', OVERCHARGE_EDGE);
      }
    };

    /**
     * Freeze the simulation briefly.
     *
     * Ordinary kills DON'T re-trigger while a freeze is already running. That
     * guard matters: a Nova sweeping a full formation resolves a dozen kills
     * across a couple of hundred milliseconds, and without it each one would
     * extend the freeze again and the screen-clearing ultimate — the most
     * spectacular thing in the game — would play as a stutter.
     *
     * `force` is for the events that should always land: a boss kill and a
     * special activation, which are singular and deserve the full stop.
     */
    const hitStop = (seconds: number, force = false) => {
      const s = g.current;
      if (!force && s.hitStop > 0) return;
      s.hitStop = Math.min(HITSTOP_MAX, Math.max(s.hitStop, seconds));
    };

    /**
     * Score a kill through the chain, and pay its energy.
     *
     * `base` is the target's raw value; the chain multiplier and a risk bonus
     * for killing high up the screen are applied here so every scoring path
     * agrees on the maths.
     */
    const scoreKill = (base: number, x: number, y: number, energy: number) => {
      const s = g.current;
      const before = multiplierFor(s.chain);
      const mult = addChain(s);
      // 0 at the player's own height, 1 at the top of the board.
      const riskFrac = Math.max(0, Math.min(1, (s.avatarY - y) / Math.max(1, s.avatarY)));
      const gained = killScore(base, mult, riskFrac);
      s.score += gained;
      addEnergy(energy);
      playKill(mult);

      // A callout only when the multiplier crosses a milestone, so the screen
      // stays quiet during ordinary killing.
      const callout = calloutFor(before, mult);
      if (callout !== undefined) {
        float(SCREEN.W / 2, SCREEN.H * 0.38, `CHAIN ×${callout}`, CHAIN_HUD_HOT);
        play('ding', 0.65);
      }
      float(
        x,
        y - 16,
        mult > 1 ? `${gained} ×${mult}` : `${gained}`,
        mult >= 5 ? CHAIN_HUD_HOT : CHAIN_HUD_COLOR,
        0.6
      );
    };

    // --- Taking a hit -------------------------------------------------------
    // Every way the player can be hurt routes through here, so a shield blocks
    // identically whether the source is a ram or a bullet — and so `hitsTaken`
    // can't drift out of step with the hearts actually lost.
    /**
     * The shield boon is only protection while it still has budget left.
     *
     * The render applies the same two conditions (see `shieldUp` at the hoop),
     * so what is drawn and what actually absorbs a shot cannot disagree.
     */
    const shieldUp = () => isShielded(g.current.boons) && g.current.shieldLeft > 0;
    /** Anything that makes the player untouchable right now. */
    const isInvulnerable = () => shieldUp() || g.current.bulwarkTime > 0;

    const takeHit = (label?: string) => {
      const s = g.current;
      if (isInvulnerable()) {
        // Absorbed outright. Loud feedback matters here: a silent save reads as
        // a missed collision, and the player stops trusting the shield.
        const bulwark = s.bulwarkTime > 0;
        s.shake = Math.max(s.shake, SHAKE_ABSORB);
        play('ding', 0.55);
        haptic(HapticWeight.Medium);
        const tint = bulwark ? BULWARK_COLOR : SHIELD_COLOR;
        burst(s.avatarX, s.avatarY, tint, 10);
        float(s.avatarX, s.avatarY - 40, bulwark ? 'BULWARK' : 'BLOCKED', tint);
        // Bulwark runs its own budget (`bulwarkLeft`) and its own timer, so only
        // the boon spends a charge here. Bulwark is checked FIRST, which means a
        // shell held over a shield protects the shield's remaining hits too —
        // the stronger defence should not be quietly billed to the weaker one.
        if (!bulwark) {
          s.shieldLeft -= 1;
          if (s.shieldLeft <= 0) {
            s.shieldLeft = 0;
            // Deleted rather than zeroed: tickBoons announces anything it finds
            // running out, and a shatter must not also report "SHIELD OVER" a
            // frame later. This is the only message for it.
            delete s.boons.shield;
            // Deliberately NO shake: the absorb above already spent it on this
            // same hit, and a shatter is not damage reaching the hull. The
            // bigger burst, the label, the buzz and a heavy haptic carry it —
            // see the camera-shake policy in constants.ts.
            burst(s.avatarX, s.avatarY + AVATAR_HULL_CY, SHIELD_COLOR, 18);
            float(s.avatarX, s.avatarY - 56, 'SHIELD BROKEN', SHIELD_COLOR);
            play('buzz', 0.7);
            haptic(HapticWeight.Heavy, Haptics.ImpactFeedbackStyle.Heavy);
          }
        }
        return;
      }
      s.hearts -= 1;
      s.hitsTaken += 1;
      s.bossDamageTaken += 1; // spoils a "perfect boss" while one is on screen
      s.waveHits += 1; // …and a flawless clear of the wave in progress
      // The chain collapses to ×1 — not to zero. Losing a heart already hurts;
      // wiping the chain on top of it teaches players to turtle, which is the
      // opposite of what the graze system is trying to encourage.
      breakChain(s);
      s.waveChainHeld = false;
      s.shake = SHAKE_MAX; // the hardest hit in the game, by definition
      s.hitFlash = 0.3;
      play('buzz', 0.9);
      hapticFailure();
      burst(s.avatarX, s.avatarY, PALETTE.threat, 14);
      float(s.avatarX, s.avatarY - 40, label ? `-1 HULL · ${label}` : '-1 HULL', PALETTE.threat);
    };

    // --- Dealing damage to an enemy ---------------------------------------
    // Hoisted to the loop closure (rather than living inside update()) because
    // three separate callers need it: the bullet pass, the Nova ring, and the
    // bomb/nuke detonation, which fires from a button OUTSIDE the frame.
    //
    // Shielded elites absorb into their own pool first; a kill routes through
    // `killEnemy` so every death — bullet, blast or shockwave — pays the same
    // bounty and runs the same on-death effects.
    const damage = (c: Card, dmg: number, hx: number, hy: number) => {
      const s = g.current;
      s.damageDealt += dmg;

      // A Shielded elite's pool eats damage before the hull does, and reads
      // visibly different while it holds.
      if (c.shieldHp !== undefined && c.shieldHp > 0) {
        c.shieldHp -= dmg;
        c.hitT = 0.12;
        if (c.shieldHp <= 0) {
          c.shieldHp = 0;
          burst(cardX(c), c.y + c.h / 2, ELITES.shielded.color, 14);
          float(cardX(c), c.y - 12, 'SHIELD DOWN', ELITES.shielded.color);
        } else {
          burst(hx, hy, ELITES.shielded.color, 3);
        }
        return; // nothing reaches the hull this hit
      }

      c.hp -= dmg;
      c.hitT = 0.12;
      c.regenIdle = 0; // interrupts a Regenerating elite
      if (c.hp <= 0) {
        killEnemy(c, hx, hy);
      } else {
        burst(hx, hy, PALETTE.gold, 3); // spark on a surviving enemy
      }
    };

    // Everything that happens when an enemy actually dies: rewards, stats and
    // the archetype/elite death effects.
    const killEnemy = (c: Card, hx: number, hy: number) => {
      const s = g.current;
      c.dead = true;
      c.deadT = 0;
      // The kill sound is pitched by the chain (see scoreKill → playKill), so
      // there is deliberately no fixed pop here any more.
      const ox = cardX(c);
      const oy = c.y + c.h / 2;

      if (c.boss) {
        hitStop(HITSTOP_BOSS_KILL, true);
        scoreKill(
          c.boss === 'giant' ? SCORE_GIANT_BOSS : SCORE_MINI_BOSS,
          ox,
          oy,
          ENERGY_PER_BOSS
        );
        // The fireball carries the beat now, so the debris is a garnish on top
        // rather than the whole effect — which is what used to cost 50 views at
        // the exact moment the screen was fullest.
        playExplosion(ox, oy, EXPLOSION_BOSS, EXPLOSION_VIS * EXPLOSION_BOSS_SCALE);
        burst(ox, oy, PALETTE.gold, 14);
        dropCoins(s, ox, oy, c.boss === 'giant' ? BOSS_GIANT_COINS : BOSS_MINI_COINS);
        // Bosses are where the deep currencies come from, which is what stops
        // late upgrade levels being farmable off wave-1 coins.
        if (c.boss === 'giant') {
          s.giantBossKills += 1;
          s.chips += 3;
          s.crystals += 2;
          s.alloy += 1;
          float(ox, oy - 30, 'SALVAGE +1 +2 +3', PALETTE.gold);
        } else {
          s.miniBossKills += 1;
          s.chips += 2;
          float(ox, oy - 30, '+2 CHIPS', PALETTE.gold);
        }
        // A boss killed without it ever costing a heart is a "perfect" kill —
        // the counter achievements read off.
        if (s.bossDamageTaken === 0) s.perfectBosses += 1;
        s.bossDamageTaken = 0;
        return;
      }

      s.kills += 1;
      // Elites are worth four times a drone and freeze the frame a touch
      // longer, so a hard target reads as a hard target.
      hitStop(c.elite ? HITSTOP_ELITE : HITSTOP_KILL);
      scoreKill(
        c.elite ? SCORE_ELITE : SCORE_ENEMY,
        ox,
        oy,
        c.elite ? ENERGY_PER_ELITE : ENERGY_PER_KILL
      );
      // Sprite fireball in the dead hull's colour, plus a few sparks for
      // direction. An elite's burst keeps its aura colour so the modifier still
      // reads at the moment it dies.
      playExplosion(ox, oy, explosionForShip(c.shipIdx ?? 0), EXPLOSION_VIS);
      burst(ox, oy, c.elite ? ELITES[c.elite].color : PALETTE.threat, c.elite ? 8 : 5);

      // Bounty: archetype value plus the elite's bonus, paid straight into the
      // run's purse rather than as collectable coins (a wave of elites would
      // otherwise carpet the screen in coin cards).
      const bounty = bountyOf(c);
      if (bounty > 0) {
        s.coins += bounty;
        float(ox, oy - 18, `+${bounty}`, COIN_GOLD, 0.6);
      }

      if (c.elite) {
        s.eliteKills += 1;
        const el = ELITES[c.elite];
        if (Math.random() < el.crystalChance) {
          s.crystals += 1;
          float(ox, oy - 34, '+1 CRYSTAL', PALETTE.goldHi);
        }
        // Explosive elites take a parting shot at whoever killed them.
        if (c.elite === 'explosive') {
          explosiveBurst(c, s.wave, (spec) => spawnEnemyShot(spec));
        }
      }

      // Splitters break into two smaller drones — the card is dying, so the
      // children are spawned here rather than by any one damage source.
      for (const child of splitChildren(c, s.wave)) {
        const kid = makeEnemy(s, child.lane, child.y, s.wave, 0);
        // makeEnemy parks a new spawn ABOVE the screen so it can stream in.
        // A split child must appear where its parent just died instead, so it
        // is placed at (and already holding at) the death position.
        kid.y = child.y;
        kid.holdY = child.y;
        kid.cx = child.cx;
        kid.homeX = child.cx;
        kid.hp = child.hp;
        kid.maxHp = child.hp;
        kid.h = Math.round(OB_HIT * 0.8);
        kid.w = kid.h;
        kid.arch = 'scout'; // children scatter rather than inheriting the split
        kid.splitsLeft = 0; // …and cannot split again
        kid.fireEvery = ARCHETYPES.scout.fireEvery;
        kid.fireT = ARCHETYPES.scout.fireEvery * (0.4 + Math.random());
        // Desynchronised behaviour clocks, or the two halves would sway in
        // perfect lockstep and read as one object.
        kid.behaveT = Math.random() * Math.PI * 2;
        s.cards.push(kid);
      }
    };

    // A bomb's direct hit also detonates: nearby enemy ships take splash
    // damage (half the direct hit).
    const explode = (hit: Card, hx: number, hy: number) => {
      const s = g.current;
      burst(hx, hy, PALETTE.amber, 18);
      // Snapshot, for the same reason as the bomb: splash that kills a splitter
      // must not then splash the children it spawned.
      for (const o of s.cards.slice()) {
        if (o === hit || !isHazard(o)) continue;
        const ox = cardX(o);
        const oy = o.y + o.h / 2;
        if (Math.hypot(ox - hx, oy - hy) <= BOMB_SPLASH_RADIUS) {
          damage(o, BOMB_SPLASH_DMG, ox, oy);
        }
      }
    };

    // Queue an enemy shot from a spec (the shape enemies.ts emits). Centralised
    // so archetype fire, elite death bursts and the legacy volley all produce
    // identically-shaped bullets.
    const spawnEnemyShot = (spec: EnemyShotSpec, ownerId?: number) => {
      const s = g.current;
      // Refuse rather than recycle — see MAX_ENEMY_BULLETS. A shot that is never
      // born is invisible; one deleted mid-flight is a bug the player watches.
      if (s.enemyBullets.length >= MAX_ENEMY_BULLETS) return;
      const size = spec.size ?? ENEMY_BULLET_SIZE;
      s.enemyBullets.push({
        id: s.nextId++,
        x: spec.x,
        y: spec.y,
        vx: spec.vx,
        vy: spec.vy,
        kind: spec.kind,
        color: spec.color ?? WAVE_COLORS[(s.wave - 1 + WAVE_COLORS.length) % WAVE_COLORS.length],
        size,
        phase: Math.random() * Math.PI * 2,
        life: spec.life ?? ENEMY_BULLET_LIFE,
        shot: spec.shot,
        ownerId,
        ...enemyShotRender(spec.vx, spec.vy, size, spec.shot),
      });
    };

    // --- The bomb: one tap clears the board's fire and hits everything ---
    // Shared by the bomb button and the Screen Nuke boon, because they are the
    // same event — which keeps one blast implementation instead of two that
    // drift apart. `free` skips the ammo cost (the boon is a gift, not a spend).
    const detonate = (free = false) => {
      const s = g.current;
      if (overRef.current || pausedRef.current) return;
      if (!free) {
        if (s.bombs <= 0) return;
        s.bombs -= 1;
        s.bombsUsed += 1;
      }

      s.bombFlash = BOMB_FLASH_TIME;
      play('whoosh', 1);
      play('buzz', 0.6);
      haptic(HapticWeight.Heavy, Haptics.ImpactFeedbackStyle.Heavy);
      float(s.avatarX, s.avatarY - 70, free ? 'NUKE' : 'BOMB', PALETTE.amber);

      // Every enemy shot on screen is wiped — this is the ability's real value.
      for (const b of s.enemyBullets) burst(b.x, b.y, b.color, 2);
      s.enemyBullets = [];

      // Then damage everything. Bomb damage scales with the Bomb Bay upgrade.
      //
      // Iterated over a SNAPSHOT of the card list, not the live array: killing a
      // splitter appends its children to s.cards, and a live `for...of` would
      // walk into them and blast the halves the same detonation just created.
      const dmg = statsRef.current.bombDmg;
      for (const c of s.cards.slice()) {
        if (!isHazard(c)) continue;
        const ox = cardX(c);
        const oy = c.y + c.h / 2;
        burst(ox, oy, PALETTE.amber, 6);
        damage(c, dmg, ox, oy);
      }
    };
    detonateRef.current = () => detonate(false);

    // --- Collecting a utility pickup ---
    // Timed boons write a countdown into s.boons; instants resolve here and
    // store nothing. Split this way so adding a boon means one case, not a new
    // GameState field.
    const collectBoon = (kind: BoonKind) => {
      const s = g.current;
      const def = BOONS[kind];
      s.pickupsCollected += 1;
      play('ding', 0.9);
      haptic(HapticWeight.Medium, Haptics.ImpactFeedbackStyle.Medium);
      burst(s.avatarX, s.avatarY, def.color, 14);
      float(s.avatarX, s.avatarY - 44, def.name.toUpperCase(), def.color);

      if (!isInstant(kind)) {
        applyTimedBoon(s.boons, kind);
        // A refreshed shield gets a fresh hit budget as well as a fresh timer.
        // Without this, re-collecting one that was a hit from shattering would
        // hand back six seconds of hoop and no actual protection.
        if (kind === 'shield') s.shieldLeft = SHIELD_HITS;
        return;
      }
      switch (kind) {
        case 'repair':
          s.hearts = s.maxHearts;
          break;
        case 'extraHeart':
          // The only thing in the game that lifts the heart ceiling, and it
          // fills the heart it just added so the pickup pays off immediately.
          s.maxHearts = Math.min(EXTRA_HEART_CEILING, s.maxHearts + 1);
          s.hearts = Math.min(s.maxHearts, s.hearts + 1);
          break;
        case 'nuke':
          detonate(true);
          break;
        case 'bombPack':
          s.bombs = Math.min(s.bombCap, s.bombs + 1);
          break;
        case 'energy':
          // Tops the meter to armed — never straight to overcharge, so the pickup
          // is a strong tempo gift without skipping the banking decision.
          s.specialCharge = Math.max(s.specialCharge, 1);
          chargeAnim.current.setValue(s.specialCharge);
          break;
        case 'luckyDrop':
          dropCoins(s, s.avatarX, s.avatarY - 30, 8);
          break;
      }
    };

    // --- The ship special: one tap spends the whole meter ---
    // Fired from the FIRE button, i.e. OUTSIDE the loop — so it only ever seeds
    // state (spawns projectiles, starts timers) and lets the next update() pass
    // resolve it. Lives in this closure to reach burst()/float().
    const fireSpecial = () => {
      const s = g.current;
      if (overRef.current || pausedRef.current || s.specialCharge < 1) return;
      // Overcharged firings are stronger. This is the decision the meter exists
      // to create: spend it now to survive the screen in front of you, or hold
      // and bank it for the boss.
      const over = s.specialCharge >= ENERGY_OVERCHARGE;
      // Spend the whole meter — it starts refilling from empty next frame.
      s.specialCharge = 0;
      chargeAnim.current.setValue(0);
      specialPulse.current.setValue(1);

      s.specialsUsed += 1;
      // A short freeze on activation, so the ultimate lands with weight rather
      // than simply appearing.
      hitStop(HITSTOP_BOSS_PHASE, true);
      play('whoosh', 1);
      play('ding', over ? 1 : 0.85);
      haptic(HapticWeight.Heavy, Haptics.ImpactFeedbackStyle.Heavy);
      float(
        s.avatarX,
        s.avatarY - 64,
        `${SPECIALS[avatarSpecial].name}${over ? ' +' : ''}`,
        over ? OVERCHARGE_EDGE : PALETTE.gold
      );

      if (avatarSpecial === 'bulwark') {
        // Ironclad: a hard shell that eats everything and throws it back. The
        // reflect budget is what makes an overcharged Bulwark meaningfully
        // stronger rather than just longer.
        s.bulwarkTime = over ? BULWARK_TIME_OVER : BULWARK_TIME;
        s.bulwarkLeft = over ? BULWARK_REFLECT_MAX * 2 : BULWARK_REFLECT_MAX;
        burst(s.avatarX, hullY(s), BULWARK_COLOR, over ? 26 : 18);
      } else if (avatarSpecial === 'phantom') {
        // Specter: two ghosts of your own hull fade in and fire alongside you.
        s.phantomTime = PHANTOM_TIME;
        burst(s.avatarX - PHANTOM_OFFSET, hullY(s), PHANTOM_TINT, 12);
        burst(s.avatarX + PHANTOM_OFFSET, hullY(s), PHANTOM_TINT, 12);
      } else if (avatarSpecial === 'talons') {
        // Raptor: open up. The barrage runs itself from here — the update pass
        // walks a fan of claws out every TALON_BURST_EVERY until it times out.
        s.talonTime = TALON_BURST_TIME;
        s.talonTimer = 0; // first fan leaves on the very next frame
        burst(s.avatarX, s.avatarY + 10, PALETTE.violet, 14);
      } else if (avatarSpecial === 'nova') {
        // Nova: the wave detonates where the ship stands and expands from that
        // fixed point — the ship flies on out of its own blast.
        s.novaR = 1;
        s.novaX = s.avatarX;
        s.novaY = hullY(s);
        s.novaHits = [];
        burst(s.novaX, s.novaY, PALETTE.gold, 26);
        burst(s.novaX, s.novaY, NOVA_FLASH_COLOR, 16); // white-hot debris in the fireball
      } else if (avatarSpecial === 'spears') {
        // Valkyrie: a chaotic downpour. First a spear locked to each enemy
        // column — that part stays exact, so the ability always connects…
        const xs: number[] = [];
        for (const t of hazardsByProximity(s.cards, SCREEN.H)) {
          if (xs.length >= SPEAR_COUNT) break;
          const x = cardX(t);
          // Same column: the spear pierces the whole stack, so one will do.
          if (xs.some((v) => Math.abs(v - x) < OB_HIT * 0.6)) continue;
          xs.push(x);
        }
        // …then the rest scattered at random across the play area. Random, not
        // evenly spaced: an even fill is exactly the tidy rank of rails this is
        // meant to avoid, and at SPEAR_COUNT the coverage is dense regardless.
        const span = SCREEN.W - FEED_PAD * 2;
        while (xs.length < SPEAR_COUNT) {
          xs.push(FEED_PAD + Math.random() * span);
        }
        // Queued rather than launched here: thirty sprites created on the
        // activation frame was this ability's real cost. The drain in update()
        // releases them in waves — see GameState.spearQueue.
        s.spearQueue = xs;
        s.spearQueueT = 0; // first wave leaves on the very next frame
      }
    };
    fireSpecialRef.current = fireSpecial;

    // ONE context object, allocated once for the whole run and re-pointed each
    // frame. stepEnemy/enemyFire are called for every live enemy, so building a
    // fresh object per enemy per frame would allocate hundreds of short-lived
    // objects a second and hand the GC steady work in the hot path.
    const ectx = {
      dt: 0,
      elapsed: 0,
      playerX: 0,
      playerY: 0,
      wave: 0,
      worldSpeed: 0,
      fire: (spec: EnemyShotSpec) => spawnEnemyShot(spec, ectxOwner),
    };
    // The enemy currently being stepped, so its shots can be attributed back to
    // it (a Vampiric elite heals when its own shot lands).
    let ectxOwner: number | undefined;

    const update = (dt: number) => {
      const s = g.current;
      const stats = statsRef.current;

      // --- Hit-stop -------------------------------------------------------
      // A few frames of genuinely frozen simulation on impact, so a kill reads
      // as a hit landing rather than a number changing. Everything below is
      // skipped while it burns down — including the background scroll, which is
      // what makes the freeze read as the whole world stopping. The render
      // still runs (tick() calls setFrame regardless), so the frame the player
      // is staring at is the frame of the impact.
      if (s.hitStop > 0) {
        s.hitStop = Math.max(0, s.hitStop - dt);
        return;
      }

      s.elapsed += dt;

      // Timed boons burn down first, so every read below sees this frame's
      // truth rather than last frame's.
      const expired = tickBoons(s.boons, dt);
      for (const k of expired) {
        float(s.avatarX, s.avatarY - 52, `${BOONS[k].name.toUpperCase()} OVER`, PALETTE.inkDim);
      }
      const frozen = enemiesFrozen(s.boons);

      // Altitude drives everything: the higher you climb, the harder the
      // engines burn — and the faster the feed rains down on you.
      const r = Math.min(s.alt / RAMP_ALT, 1);
      s.alt += (ALT_RATE_MIN + (ALT_RATE_MAX - ALT_RATE_MIN) * r) * dt;
      const speed = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * r;

      // Scroll each parallax layer on the native side: set its translateY to the
      // altitude-driven offset, wrapped within one repeat period. No React
      // re-render — the background subtree stays mounted and memoized.
      for (let i = 0; i < bgAnims.current.length; i++) {
        const L = background.layers[i];
        const off = s.alt * BG_PX_PER_M * L.speed;
        // Each layer wraps on its OWN period — the star veil is a square tile
        // in sets that otherwise tile at 16:9, and one shared period would
        // slide it the wrong distance and tear a seam through the stars.
        bgAnims.current[i].setValue(off % layerPeriod(background, L));
      }
      if (background.planet) {
        const planetPeriod = background.planet.items.length * PLANET_SPACING;
        const poff = s.alt * BG_PX_PER_M * PLANET_SPEED;
        planetAnim.current.setValue(poff % planetPeriod);
      }

      // Rocket sticks to the finger while dragging (tight lerp kills jitter
      // without feeling laggy), clamped to the play area.
      if (s.dragging) {
        // Thrusters upgrade sharpens this — a higher lerp constant means the
        // hull closes the gap to the finger in fewer frames.
        const k = Math.min(stats.dragLerp * dt, 1);
        s.avatarX += (s.targetX - s.avatarX) * k;
        s.avatarY += (s.targetY - s.avatarY) * k;
        const minX = FEED_PAD + AVATAR_SIZE / 2;
        const maxX = SCREEN.W - FEED_PAD - AVATAR_SIZE / 2;
        s.avatarX = Math.max(minX, Math.min(maxX, s.avatarX));
        s.avatarY = Math.max(60, Math.min(SCREEN.H - AVATAR_SIZE - 40, s.avatarY));
      }

      // Gift guns are on a timer and revert to the single shooter.
      if (s.gun !== 'single') {
        s.gunTime -= dt;
        if (s.gunTime <= 0) {
          s.gun = 'single';
          s.gunLevel = 1;
        }
      }

      // The FIRE meter refills on its own — but only on a hull that has
      // something to spend it on. The free ship's stays empty forever, which is
      // exactly what its locked button is advertising. Written straight to the
      // native view, so a meter that moves every frame costs no React renders.
      // Energy is EARNED (see addEnergy, called from kills and grazes). The only
      // passive contribution is a slow floor while the board is empty, so a
      // player can never be locked out of the mechanic during a lull between
      // waves or while a boss descends.
      const enemiesOnBoard = s.cards.some((c) => isHazard(c) && c.y > 0);
      if (!enemiesOnBoard && s.specialCharge < 1) {
        addEnergy(ENERGY_IDLE_PER_SEC * dt);
      }
      if (s.specialCharge >= 1) {
        // Armed: a slow throb so the button reads as tappable at a glance. It
        // beats faster once overcharged, to advertise that waiting paid off.
        const over = s.specialCharge >= ENERGY_OVERCHARGE;
        specialPulse.current.setValue(1 + (over ? 0.09 : 0.05) * Math.sin(s.elapsed * (over ? 9 : 6)));
      }
      // Ironclad's shell runs down on its own timer.
      if (s.bulwarkTime > 0) s.bulwarkTime = Math.max(0, s.bulwarkTime - dt);

      // The chain window burns down; once it lapses the multiplier sheds one
      // step at a time rather than collapsing.
      if (tickChain(s, dt) && s.chain === 0) {
        float(s.avatarX, s.avatarY - 58, 'CHAIN LOST', PALETTE.inkDim);
      }
      // Specter's ghost wingmen fade out on their own timer.
      if (s.phantomTime > 0) s.phantomTime = Math.max(0, s.phantomTime - dt);

      // Gun drops, hearts and coins float down on their own timers.
      s.giftTimer -= dt;
      if (s.giftTimer <= 0) {
        s.giftTimer = GIFT_EVERY * (0.8 + Math.random() * 0.5);
        s.cards.push(makeCard(s, Math.floor(Math.random() * LANES), 'gift'));
      }
      s.heartTimer -= dt;
      if (s.heartTimer <= 0) {
        s.heartTimer = HEART_EVERY * (0.8 + Math.random() * 0.5);
        s.cards.push(makeCard(s, Math.floor(Math.random() * LANES), 'heart'));
      }
      s.coinTimer -= dt;
      if (s.coinTimer <= 0) {
        s.coinTimer = COIN_EVERY * (0.8 + Math.random() * 0.5);
        s.cards.push(makeCard(s, Math.floor(Math.random() * LANES), 'coin'));
      }
      // Utility pickups roll their effect at spawn (like gun drops do) so the
      // falling badge can advertise what it grants.
      s.boonTimer -= dt;
      if (s.boonTimer <= 0) {
        s.boonTimer = BOON_EVERY * (0.8 + Math.random() * 0.5);
        const card = makeCard(s, Math.floor(Math.random() * LANES), 'boon');
        card.boon = rollBoon(s.wave);
        s.cards.push(card);
      }

      // Waves: enemies hold in a formation up top until you destroy them all,
      // then the next (harder) wave drops in.
      const enemiesAlive = s.cards.some((c) => c.kind === 'rage' && !c.dead);
      if (enemiesAlive) {
        s.waveClearTimer = WAVE_GAP;
      } else {
        s.waveClearTimer -= dt;
        if (s.waveClearTimer <= 0) {
          // The wave just ended (wave 0 is the pre-run state, so there was no
          // formation to clear flawlessly on the very first spawn).
          if (s.wave >= 1) {
            const earned = ribbonsFor({
              waveHits: s.waveHits,
              chainHeld: s.waveChainHeld,
              waveSeconds: s.elapsed - s.waveStartT,
            });
            if (earned.length) {
              // Still paid, just no longer announced: the banner was three gold
              // slabs across the middle of the play field at the exact moment a
              // new formation arrives. The 'ding' is what tells you now.
              s.score += ribbonTotal(earned);
              play('ding', 0.9);
              haptic(HapticWeight.Medium, Haptics.ImpactFeedbackStyle.Medium);
            }
            if (s.waveHits === 0) {
              s.flawlessWaves += 1;
              // A clean wave also feeds the meter, so playing well is what arms
              // the special rather than waiting does.
              addEnergy(ENERGY_PER_FLAWLESS_WAVE);
            }
          }
          s.waveHits = 0;
          s.waveChainHeld = true;
          s.waveStartT = s.elapsed;
          s.wave += 1;
          s.waveClearTimer = WAVE_GAP;
          spawnWave(s, s.wave);
          const label =
            s.wave % 10 === 0
              ? `WAVE ${s.wave} · GIANT BOSS`
              : s.wave % 5 === 0
                ? `WAVE ${s.wave} · MINI BOSS`
                : `WAVE ${s.wave}`;
          float(SCREEN.W / 2, SCREEN.H * 0.34, label, PALETTE.gold);
        }
      }

      // The hurtbox, centred on the DRAWN hull rather than hung below it. Same
      // 44×44 area it has always been — see AVATAR_HIT_W — so the difficulty is
      // unchanged; it simply now sits where the ship the player is looking at
      // actually is. Shots that pass visibly under the hull no longer land, and
      // the nose is no longer immune.
      const cy = hullY(s);
      const avLeft = s.avatarX - AVATAR_HIT_W / 2;
      const avRight = s.avatarX + AVATAR_HIT_W / 2;
      const avTop = cy - AVATAR_HIT_H / 2;
      const avBottom = cy + AVATAR_HIT_H / 2;
      // The same box the hit test uses, handed to the graze check — so "near
      // miss" is measured against exactly the box that would have been a hit.
      const grazeBox = { left: avLeft, right: avRight, top: avTop, bottom: avBottom };

      // Re-point the shared enemy context at this frame (see `ectx` above).
      ectx.dt = dt;
      ectx.elapsed = s.elapsed;
      ectx.playerX = s.avatarX;
      ectx.playerY = hullY(s);
      ectx.wave = s.wave;
      ectx.worldSpeed = speed;

      // Cards
      const keptCards: Card[] = [];
      for (const c of s.cards) {
        if (c.dead) {
          c.deadT += dt;
          if (c.deadT < 0.18) keptCards.push(c);
          continue;
        }
        c.hitT = Math.max(0, c.hitT - dt);
        if (c.kind === 'rage') {
          if (frozen) {
            // Freeze Time: enemies hold absolutely still and skip their weapon
            // clocks entirely. Checked before every movement branch so nothing
            // — descent, charge or archetype motion — slips through.
          } else if (c.boss) {
            if (c.holdY !== undefined && c.y < c.holdY) {
              c.y = Math.min(c.holdY, c.y + descendSpeed(c) * dt);
            } else {
              // Bosses sway side to side across the top of the screen. Width
              // and speed both come from the current phase, so a wounded boss
              // visibly moves harder — the escalation is legible before the
              // player has read a single number off the health bar.
              //
              // Stepped by `dt`, never by run time: bossSway integrates the
              // sway rather than sampling a clock, which is what keeps a phase
              // change from relocating the boss. It also starts its sine at
              // zero, so a boss eases out of its descent point at screen centre
              // instead of landing mid-swing.
              c.cx = bossSway(c, dt);
            }
          } else {
            // Wave 20+: a wounded enemy breaks formation and dives at the
            // player. Archetypes with their own motion keep it — this legacy
            // behaviour only claims the plain hold-and-shoot drones, so a
            // Sniper doesn't abandon its post the moment it's chipped.
            if (
              s.wave >= CHARGE_WAVE &&
              !c.charging &&
              c.hp <= 2 &&
              c.holdY !== undefined &&
              (c.arch === undefined || c.arch === 'grunt')
            ) {
              c.charging = true;
              c.cx = laneX(c.lane);
            }
            if (c.charging) {
              const curX = c.cx ?? laneX(c.lane);
              const dx = s.avatarX - curX;
              const dy = hullY(s) - (c.y + c.h / 2);
              const d = Math.hypot(dx, dy) || 1;
              c.cx = curX + (dx / d) * CHARGE_SPEED * dt;
              c.y += (dy / d) * CHARGE_SPEED * dt;
            } else if (c.holdY !== undefined && !c.arrived && c.y < c.holdY) {
              // Drop into the formation slot, then hold. Swift elites arrive
              // faster. `homeX` is latched here so the movement behaviours have
              // a formation anchor to sway/orbit around once it lands.
              c.y = Math.min(c.holdY, c.y + descendSpeed(c) * dt);
              if (c.homeX === undefined) c.homeX = laneX(c.lane);
              // Arrival is LATCHED, not re-derived from `y < holdY` each frame.
              // An orbit legitimately carries the card above its slot, and the
              // old test read that as "still descending" — so the orbit and the
              // descent clamp fought for the card on alternate frames and it sat
              // juddering at holdY instead of circling.
              if (c.y >= c.holdY) c.arrived = true;
            } else {
              // In position: run its archetype's movement and its own weapon.
              c.arrived = true;
              ectxOwner = c.id;
              stepEnemy(c, ectx);
              enemyFire(c, ectx);
              ectxOwner = undefined;
            }
          }
        } else {
          // Pickups (heart / coin / gift / boon) drift down slower than the
          // world so you have time to line up under them.
          c.y += speed * PICKUP_FALL_SCALE * dt;
          // Coin Magnet: coins on screen come to YOU. Only coins — magnetising
          // hearts and gun drops would remove the last bit of positioning the
          // pickups ask for.
          if (c.kind === 'coin' && boonActive(s.boons, 'magnet')) {
            const cxNow = cardX(c);
            const dx = s.avatarX - cxNow;
            const dy = hullY(s) - (c.y + c.h / 2);
            const d = Math.hypot(dx, dy);
            if (d < MAGNET_RADIUS && d > 0.5) {
              c.cx = cxNow + (dx / d) * MAGNET_PULL * dt;
              c.y += (dy / d) * MAGNET_PULL * dt;
            }
          }
        }
        // Hitbox centered on the (possibly charging) position.
        const hw = (c.w ?? OB_HIT) / 2;
        const cLeft = cardX(c) - hw;
        const cRight = cardX(c) + hw;
        const overlapV = c.y < avBottom && c.y + c.h > avTop;
        const overlapH = avRight > cLeft && avLeft < cRight;

        // Bosses survive contact — the hit-flash window doubles as brief
        // invulnerability so an overlap doesn't drain a heart per frame.
        if (overlapV && overlapH && !(c.boss && s.hitFlash > 0)) {
          // Contact
          if (!c.boss) {
            c.dead = true;
            c.deadT = 0;
          }
          if (c.kind === 'heart') {
            s.hearts = Math.min(s.maxHearts, s.hearts + 1);
            s.heartsCollected += 1;
            s.pickupsCollected += 1;
            playPop(4);
            haptic(HapticWeight.Light);
            burst(s.avatarX, s.avatarY, PALETTE.plasma, 12);
            float(s.avatarX, s.avatarY - 40, '+1 HULL', PALETTE.plasma);
          } else if (c.kind === 'coin') {
            const value = coinValue(s.boons);
            s.coins += value;
            s.pickupsCollected += 1;
            playPop(2);
            haptic(HapticWeight.Light);
            burst(s.avatarX, s.avatarY, COIN_GOLD, 10);
            float(s.avatarX, s.avatarY - 40, `+${value} COIN${value > 1 ? 'S' : ''}`, COIN_GOLD);
          } else if (c.kind === 'boon') {
            // A utility pickup. The effect was rolled at spawn so the badge
            // could advertise it; older snapshots without one roll here.
            collectBoon(c.boon ?? rollBoon(s.wave));
          } else if (c.kind === 'gift') {
            // The gun was decided at spawn so the drop could show its own art.
            // Snapshots saved before that (resumed v3 runs) have no gun on the
            // card, so fall back to rolling here.
            const rolled = c.gun ?? GIFT_GUNS[Math.floor(Math.random() * GIFT_GUNS.length)];
            // Re-collecting the same gun doubles its parallel shots (1 → 2 → 4)
            // up to MAX_GUN_LEVEL; beyond that a pickup just refreshes the
            // timer. A different gun replaces it and resets the stack.
            if (rolled === s.gun) {
              s.gunLevel = Math.min(MAX_GUN_LEVEL, s.gunLevel * 2);
            } else {
              s.gun = rolled;
              s.gunLevel = 1;
            }
            s.gunTime = GUN_TIME;
            play('ding', 1);
            haptic(HapticWeight.Medium, Haptics.ImpactFeedbackStyle.Medium);
            burst(s.avatarX, s.avatarY, PALETTE.gold, 14);
            const lbl = s.gunLevel > 1 ? `${GUN_LABEL[s.gun]} ×${s.gunLevel}` : GUN_LABEL[s.gun];
            s.pickupsCollected += 1;
            float(s.avatarX, s.avatarY - 40, lbl, PALETTE.gold);
          } else {
            takeHit();
          }
        }

        if (!c.dead && c.y < SCREEN.H + 40) keptCards.push(c);
        else if (c.dead) keptCards.push(c);
      }
      s.cards = keptCards;

      // Enemies shoot back: every so often a visible rocket fires a shot aimed
      // at the player's current position (Galaxy-Attack style).
      // Frozen enemies don't fire — including through the global volley, which
      // would otherwise keep shooting from statues.
      s.enemyFireTimer -= frozen ? 0 : dt;
      if (s.enemyFireTimer <= 0) {
        // Each wave fires faster, in bigger volleys, for more damage.
        // VOLLEY_DAMPEN pulls this back now that archetypes also run their own
        // weapon clocks — without it the two systems stack into a bullet wall
        // roughly twice as dense as the difficulty curve intends.
        s.enemyFireTimer =
          (Math.max(0.75, ENEMY_FIRE_EVERY / (1 + s.wave * 0.09)) * (0.7 + Math.random() * 0.6)) /
          VOLLEY_DAMPEN;
        // Bosses are excluded: they run their own weapon clock and their own
        // patterns now (bossFire). Leaving them in meant that on a boss wave —
        // where the boss is the ONLY card on the board — every global volley
        // shot also came from the boss, burying the designed pattern under a
        // stream of unpatterned aimed fire and roughly doubling the pressure.
        // Same stacking problem VOLLEY_DAMPEN exists for, one layer up.
        const shooters = s.cards.filter((c) => !c.dead && c.kind === 'rage' && c.y > 0 && !c.boss);
        if (shooters.length) {
          const kind: EnemyBullet['kind'] =
            s.wave >= HOMING_WAVE ? 'homing' : s.wave >= ZIGZAG_WAVE ? 'zigzag' : 'straight';
          // Locking rockets come one at a time; other shots can volley — but
          // never more than two. The third shot only ever appeared deep into a
          // run, which is exactly where the screen had already stopped leaving
          // a gap to move through; capping it here targets the waves that were
          // undodgeable without touching the early game at all.
          const volley = kind === 'homing' ? 1 : Math.min(shooters.length, 2, 1 + Math.floor(s.wave / 5));
          const bSize = ENEMY_BULLET_SIZE;
          const color = WAVE_COLORS[(s.wave - 1) % WAVE_COLORS.length];
          const bSpeed = kind === 'homing' ? ENEMY_HOMING_SPEED : ENEMY_BULLET_SPEED;
          const life = kind === 'homing' ? ENEMY_HOMING_LIFE : ENEMY_BULLET_LIFE;
          for (let k = 0; k < volley; k++) {
            if (s.enemyBullets.length >= MAX_ENEMY_BULLETS) break;
            const sh = shooters[Math.floor(Math.random() * shooters.length)];
            const ox = cardX(sh);
            const oy = sh.y + sh.h;
            const dx = s.avatarX - ox;
            const dy = hullY(s) - oy;
            const d = Math.hypot(dx, dy) || 1;
            const vx = (dx / d) * bSpeed;
            const vy = (dy / d) * bSpeed;
            const shot = enemyShotFor(sh.arch);
            s.enemyBullets.push({
              id: s.nextId++,
              x: ox,
              y: oy,
              vx,
              vy,
              kind,
              color,
              size: bSize,
              phase: Math.random() * Math.PI * 2,
              life,
              shot,
              ownerId: sh.id, // lets a Vampiric elite heal off this shot
              ...enemyShotRender(vx, vy, bSize, shot),
            });
          }
        }
      }

      // --- Bosses fire on their OWN clock, not the global volley -------------
      // Deliberately outside the `enemyFireTimer` block above. Riding the shared
      // volley was what made a boss read as background pressure rather than as
      // an opponent: its attacks landed on the same beat as every drone's, so
      // there was no rhythm to learn and nothing to anticipate. bossFire owns
      // `card.fireT` and each phase sets its own cadence.
      if (!frozen) {
        // A boss is not an elite, so its shots are attributed to nobody. Reset
        // explicitly rather than relying on the archetype loop above having
        // cleared it — this loop must stay correct if that one is reordered.
        ectxOwner = undefined;
        for (const bc of s.cards) {
          if (bc.dead || !bc.boss || bc.y <= 0) continue;

          // Crossing into a new phase is the beat of the whole fight, so it is
          // announced once, on the frame it happens. Without this the boss just
          // quietly starts doing something else and the player never learns
          // that hurting it is what changed its behaviour.
          const phase = bossPhaseIndex(bc);
          if (bc.bossPhaseSeen === undefined) {
            bc.bossPhaseSeen = phase;
          } else if (phase > bc.bossPhaseSeen) {
            bc.bossPhaseSeen = phase;
            hitStop(HITSTOP_BOSS_PHASE, true);
            burst(cardX(bc), bc.y + bc.h / 2, PALETTE.threat, 16);
            float(
              cardX(bc),
              bc.y - 12,
              `PHASE ${phase + 1}`,
              PALETTE.threat,
              1
            );
            play('buzz', 0.5);
            haptic(HapticWeight.Heavy, Haptics.ImpactFeedbackStyle.Heavy);
            // A wind-up already in flight is deliberately NOT cancelled here —
            // bossFire honours it and fires the salvo the ring promised. See
            // the note on that branch: the tell must never be a lie.
          }

          bossFire(bc, ectx);
        }
      }

      // Enemy shots travel toward the player and cost a heart on contact.
      const keptEnemyBullets: EnemyBullet[] = [];
      // Slow Motion scales how far every enemy shot travels this frame; Freeze
      // Time stops them dead. Applied as a time scale rather than by rewriting
      // each bullet's velocity, so the effect is perfectly reversible when it
      // wears off.
      const ebDt = frozen ? 0 : dt * enemyBulletMult(s.boons);
      for (const b of s.enemyBullets) {
        // A run resumed from a snapshot written before the render cache existed
        // arrives with these undefined. Filling them here rather than in the
        // render keeps the draw a pure read, and costs one frame, once.
        if (b.angle === undefined) Object.assign(b, enemyShotRender(b.vx, b.vy, b.size, b.shot));
        // Lifetimes still burn down in real time — a frozen board should not
        // preserve its bullets indefinitely.
        b.life -= dt;
        if (b.kind === 'homing') {
          const dx = s.avatarX - b.x;
          const dy = hullY(s) - b.y;
          if (Math.hypot(dx, dy) > ENEMY_HOMING_DISLOCK) {
            // Still locked: slowly turn toward the player.
            const desired = Math.atan2(dy, dx);
            const cur = Math.atan2(b.vy, b.vx);
            let diff = desired - cur;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            const maxTurn = ENEMY_HOMING_TURN * dt;
            diff = Math.max(-maxTurn, Math.min(maxTurn, diff));
            const na = cur + diff;
            b.vx = Math.cos(na) * ENEMY_HOMING_SPEED;
            b.vy = Math.sin(na) * ENEMY_HOMING_SPEED;
            // The one kind that turns, so the one kind whose cached heading has
            // to be refreshed. Everything else keeps the angle it span with.
            b.angle = (Math.atan2(b.vx, -b.vy) * 180) / Math.PI;
          } else {
            // Close in: dislock and fly straight — now you can dodge it.
            b.kind = 'straight';
          }
          b.x += b.vx * ebDt;
          b.y += b.vy * ebDt;
        } else if (b.kind === 'zigzag') {
          // Forward velocity plus a smooth perpendicular sway.
          const spd = Math.hypot(b.vx, b.vy) || 1;
          const perpX = -b.vy / spd;
          const perpY = b.vx / spd;
          const lateral = Math.cos((s.elapsed + b.phase) * ZIG_FREQ) * ZIG_AMP;
          b.x += (b.vx + perpX * lateral) * ebDt;
          b.y += (b.vy + perpY * lateral) * ebDt;
        } else {
          b.x += b.vx * ebDt;
          b.y += b.vy * ebDt;
        }
        if (b.grazeFlash) b.grazeFlash = Math.max(0, b.grazeFlash - dt);

        const rad = b.size / 2;
        if (b.x + rad > avLeft && b.x - rad < avRight && b.y + rad > avTop && b.y - rad < avBottom) {
          // --- Bulwark: the shell eats the shot and throws it back ----------
          // Checked before takeHit so the reflection happens on the absorb, and
          // capped per activation so a spinner can't hand over a hundred shots.
          if (s.bulwarkTime > 0 && s.bulwarkLeft > 0) {
            s.bulwarkLeft -= 1;
            s.bullets.push({
              id: s.nextId++,
              x: b.x,
              y: b.y - 8,
              dmg: BULWARK_REFLECT_DMG * statsRef.current.dmgMult,
              kind: 'normal',
              speed: BULWARK_REFLECT_SPEED,
            });
            burst(b.x, b.y, BULWARK_COLOR, 5);
            play('ding', 0.28);
            continue; // consumed by the shell — no hit, no heart lost
          }
          burst(b.x, b.y, b.color, 8);
          const blocked = isInvulnerable();
          takeHit();
          // A Vampiric elite feeds off a landed shot. A blocked hit feeds it
          // nothing — the shield denies the heal as well as the damage, which
          // is what makes it worth having against them.
          if (!blocked && b.ownerId !== undefined) {
            const owner = s.cards.find((c) => c.id === b.ownerId && !c.dead);
            if (owner?.elite === 'vampiric') {
              owner.hp = Math.min(owner.maxHp, owner.hp + Math.max(1, owner.maxHp * 0.15));
              burst(cardX(owner), owner.y + owner.h / 2, ELITES.vampiric.color, 8);
              float(cardX(owner), owner.y - 12, 'DRAIN', ELITES.vampiric.color);
            }
          }
          continue; // consumed
        }

        // --- Graze -----------------------------------------------------------
        // A near miss: the bullet came inside the graze band without touching
        // the hull. Pays score and energy, and refreshes the chain window — so
        // the correct way to play is to fly TOWARD the dense patterns rather
        // than away from them, which is what makes the bullet-hell archetypes
        // (spinner, scattergun) desirable instead of just annoying.
        //
        // Once per bullet: `grazed` latches, or a shot sitting alongside the
        // hull would pay every single frame.
        if (!b.grazed && isGrazing(b, grazeBox)) {
          b.grazed = true;
          b.grazeFlash = 0.12;
          s.grazes += 1;
          grazeChain(s);
          s.score += Math.round(GRAZE_VALUE * multiplierFor(s.chain));
          addEnergy(ENERGY_PER_GRAZE);
          // Deliberately restrained feedback: at a dense moment this fires many
          // times a second, so a burst or a float per graze would bury the
          // screen. A throttled tick and a flick on the bullet is enough.
          playGraze(multiplierFor(s.chain));
          haptic(HapticWeight.Ambient);
        }

        // Cull on all four edges. Without the top bound, a homing rocket that
        // overshoots the player upward — or a steep boss-fan shot — would live
        // out its full life (up to 6s) as an off-screen node, iterated and
        // re-rendered every frame right when the screen is busiest.
        if (b.life > 0 && b.y > -40 && b.y < SCREEN.H + 30 && b.x > -40 && b.x < SCREEN.W + 40) {
          keptEnemyBullets.push(b);
        }
      }
      s.enemyBullets = keptEnemyBullets;


      const keptBullets: Bullet[] = [];
      // Enemy ids rockets are currently locked onto.
      //
      // Built ONCE per frame and then maintained incrementally, rather than
      // rebuilt per rocket. Re-locking only happens when a rocket's target has
      // died — which is precisely what a bomb or a Nova does to a whole
      // formation at once, so every rocket in flight re-locks on the same
      // frame and a per-rocket rebuild made that O(rockets × bullets). The
      // quadratic burst landed on the frame that was already the heaviest in
      // the game.
      //
      // Lazy: a frame where nothing re-locks — almost all of them — never
      // allocates the set at all.
      let claimed: Set<number> | null = null;
      for (const b of s.bullets) {
        if (b.kind === 'rocket') {
          // Homing: steer toward the locked enemy while zigzagging.
          let t = s.cards.find((c) => c.id === b.targetId && isHazard(c));
          if (!t) {
            // Its target died: re-lock onto something no other rocket has
            // claimed, so a volley doesn't collapse onto one enemy as the
            // formation thins out. Fall back to the nearest if all are taken.
            if (!claimed) {
              claimed = new Set<number>();
              for (const o of s.bullets) {
                if (o.kind === 'rocket' && o.targetId !== undefined) claimed.add(o.targetId);
              }
            }
            // Drop this rocket's own (now dead) claim before asking, so it is
            // never excluded from its own search — same semantics the old
            // per-rocket rebuild got by passing `self`.
            if (b.targetId !== undefined) claimed.delete(b.targetId);
            t = nearestHazard(s.cards, b.y, claimed) ?? nearestHazard(s.cards, b.y);
            b.targetId = t?.id;
            // Publish the new lock so later rockets in THIS pass avoid it,
            // exactly as they did when the set was rebuilt each time.
            if (t) claimed.add(t.id);
          }
          const preX = b.x;
          if (t) b.x += (cardX(t) - b.x) * Math.min(8 * dt, 1);
          b.x += Math.sin(s.elapsed * 16 + (b.phase ?? 0)) * 140 * dt;
          b.y -= ROCKET_SPEED * dt;
          // Face where it's actually heading (mostly up, leaning toward its
          // target), so the bolt sprite points along travel instead of sideways.
          b.angle = (Math.atan2(-ROCKET_SPEED * dt, b.x - preX) * 180) / Math.PI;
        } else if (b.kind === 'laser') {
          b.y -= (b.speed ?? BULLET_SPEED) * 1.6 * dt;
        } else if (b.kind === 'talon') {
          b.x += (b.vx ?? 0) * dt; // raked out on a free heading, not straight up
          b.y += (b.vy ?? 0) * dt;
        } else if (b.kind === 'spear') {
          // The one player shot that falls DOWN, each on its own rolled speed
          // and lean (older snapshots predate those, hence the fallbacks).
          b.x += (b.vx ?? 0) * dt;
          b.y += (b.vy ?? SPEAR_SPEED) * dt;
        } else {
          // Rail Tuning raises this per shot; snapshots from before the upgrade
          // system have no `speed` and fall back to the original constant.
          b.y -= (b.speed ?? BULLET_SPEED) * dt;
        }
        // Special shots leave the screen by other edges than the top, so each
        // needs its own bound rather than the shared "flew off the top" test.
        let alive =
          b.kind === 'spear'
            ? b.y - SPEAR_LEN < SCREEN.H && b.x > -SPEAR_LEN && b.x < SCREEN.W + SPEAR_LEN
            : b.kind === 'talon'
              ? b.y > -TALON_LEN && b.x > -TALON_LEN && b.x < SCREEN.W + TALON_LEN
              : b.y > -(LASER_LEN + 30);
        if (alive) {
          // Lasers, talons and spears all pierce: they log what they've already
          // hit and fly on, instead of being consumed by the first enemy.
          const pierces = b.kind === 'laser' || b.kind === 'talon' || b.kind === 'spear';
          // Bounded by the length BEFORE this shot resolves. Killing a splitter
          // appends its children to s.cards, and a piercing shot walking the
          // live array would carry straight on into the halves it just created,
          // wiping the splitter outright instead of leaving two enemies behind.
          // Indexed rather than a .slice() snapshot: this runs for every bullet
          // every frame, and children are only ever APPENDED, so a length bound
          // is exact and allocates nothing in the hot path.
          const cardCount = s.cards.length;
          for (let ci = 0; ci < cardCount; ci++) {
            const c = s.cards[ci];
            if (!isHazard(c)) continue;
            if (pierces && b.hits!.includes(c.id)) continue;
            const pad = b.kind === 'talon' ? TALON_PAD : 0;
            const hw = (c.w ?? OB_HIT) / 2;
            const cx = cardX(c);
            const inX = b.x > cx - hw - 4 - pad && b.x < cx + hw + 4 + pad;
            // Lasers and spears are long bodies, so they sweep a span and can't
            // tunnel past a hitbox on a slow frame (laser: tip at y, tail below;
            // spear: tip at y falling, shaft trailing above). Others are a
            // point, the fat talon padded out to the same effect.
            const inY =
              b.kind === 'laser'
                ? b.y < c.y + c.h && b.y + LASER_LEN > c.y
                : b.kind === 'spear'
                  ? b.y - SPEAR_LEN < c.y + c.h && b.y > c.y
                  : b.y > c.y - pad && b.y < c.y + c.h + pad;
            if (inX && inY) {
              s.shotsHit += 1;
              // The Damage Boost boon multiplies here rather than at fire time,
              // so a shot already in flight when the pickup lands still gets
              // the benefit — the boost reads as instant, which is how it looks.
              damage(c, b.dmg * damageMult(s.boons), b.x, b.y);
              if (b.crit) {
                // Crits get their own callout; without it a Targeting Array
                // level is invisible and reads as a dead purchase.
                float(b.x, b.y - 14, 'CRIT!', CRIT_COLOR);
                burst(b.x, b.y, CRIT_COLOR, 6);
              }
              if (b.kind === 'bomb') explode(c, b.x, b.y);
              if (pierces) {
                b.hits!.push(c.id); // pierce on through
              } else {
                alive = false;
                break;
              }
            }
          }
        }
        if (alive) keptBullets.push(b);
      }
      s.bullets = keptBullets;

      // Nova's shockwave: a ring expanding from where it went off, damaging
      // each enemy once as it crosses them and wiping the enemy fire it sweeps
      // — the one special that also clears incoming shots.
      if (s.novaR > 0) {
        s.novaR += NOVA_SPEED * dt;
        if (s.novaR >= NOVA_RADIUS) {
          s.novaR = 0;
          s.novaHits = [];
          novaAnim.current.opacity.setValue(0);
          novaAnim.current.core.setValue(0);
          novaAnim.current.flash.setValue(0);
        } else {
          // Push the wave to the native view: centre it on where it went off,
          // stretch the base ring out to the live radius, fade as it disperses.
          // Position is re-sent every frame (it's constant for the wave, but
          // that also restores a run resumed mid-blast) — four cheap setValues
          // against a re-layout of a 1200px rounded border.
          const a = novaAnim.current;
          a.x.setValue(s.novaX - NOVA_RING_BASE / 2);
          a.y.setValue(s.novaY - NOVA_RING_BASE / 2);
          a.scale.setValue((s.novaR * 2) / NOVA_RING_BASE);
          a.opacity.setValue(Math.max(0, 1 - s.novaR / NOVA_RADIUS) * 0.85);
          // Fireball and whiteout both burn out inside the first quarter-second,
          // long before the ring finishes its travel — a blast, then a wave.
          a.core.setValue(Math.max(0, 1 - s.novaR / NOVA_CORE_R) * NOVA_CORE_ALPHA);
          a.flash.setValue(Math.max(0, 1 - s.novaR / NOVA_FLASH_R) * NOVA_FLASH_ALPHA);
          // Snapshot: a splitter killed by the wave appends its children to
          // s.cards, and walking the live array would let the same ring pass
          // straight through the halves it just made.
          for (const c of s.cards.slice()) {
            if (!isHazard(c) || s.novaHits.includes(c.id)) continue;
            const ox = cardX(c);
            const oy = c.y + c.h / 2;
            if (Math.hypot(ox - s.novaX, oy - s.novaY) <= s.novaR) {
              s.novaHits.push(c.id);
              damage(c, NOVA_DMG, ox, oy);
            }
          }
          s.enemyBullets = s.enemyBullets.filter(
            (eb) => Math.hypot(eb.x - s.novaX, eb.y - s.novaY) > s.novaR
          );
        }
      }

      // Auto-fire from the rocket's nose. This runs AFTER the bullet
      // movement pass on purpose: a new shot gets rendered once at its spawn
      // point before it starts flying — otherwise on a slow frame (dt up to
      // 0.05s) it first appears a full frame-step above the ship. Shots spawn
      // deep under the hull (the ship draws on top of bullets), so they
      // visibly emerge from the nose.
      s.fireTimer -= dt;
      if (s.fireTimer <= 0) {
        // Base interval per gun, then scaled by the Autoloader upgrade and the
        // Fire Rate Boost boon. The default gun's rate already has the upgrade
        // folded in (stats.fireRate), so only the OTHER guns take the
        // multiplier — applying both to it would double-count.
        const boostMult = boonFireMult(s.boons);
        s.fireTimer =
          (s.gun === 'bomb'
            ? BOMB_FIRE_RATE * stats.fireIntervalMult
            : s.gun === 'laser'
              ? LASER_FIRE_RATE * stats.fireIntervalMult
              : s.gun === 'homing'
                ? ROCKET_FIRE_RATE * stats.fireIntervalMult
                : stats.fireRate) * boostMult;
        const by = s.avatarY + 18; // under the hull's center
        // A stacked homing gun spreads its volley across separate enemies:
        // shot i takes the i-th nearest hazard, wrapping only if the volley
        // outnumbers what's on screen.
        const volleyTargets = s.gun === 'homing' ? hazardsByProximity(s.cards, s.avatarY) : [];
        // Every shot rolls its own crit, so a burst can partly crit — one roll
        // for the whole volley would make crits feel like a mode switch.
        const fireOne = (ox: number, shotIdx: number) => {
          const base =
            s.gun === 'bomb'
              ? BOMB_DMG
              : s.gun === 'laser'
                ? LASER_DMG
                : s.gun === 'homing'
                  ? ROCKET_DMG
                  : BULLET_DMG;
          const { dmg, crit } = rollDamage(base, stats);
          s.shotsFired += 1;
          // The player's primary action was silent until now. Throttled and
          // quiet inside playShot, so a stacked gun doesn't rattle. Passing the
          // gun picks its voice, so swapping weapons is audible and not just
          // visible.
          playShot(s.gun);
          if (s.gun === 'bomb') {
            s.bullets.push({ id: s.nextId++, x: ox, y: by, dmg, crit, kind: 'bomb' });
          } else if (s.gun === 'laser') {
            // The beam draws downward from its tip, so start the tip higher —
            // this keeps the whole beam tucked under the ship at spawn.
            s.bullets.push({
              id: s.nextId++,
              x: ox,
              y: s.avatarY - 12,
              dmg,
              crit,
              kind: 'laser',
              speed: stats.bulletSpeed,
              hits: [],
            });
          } else if (s.gun === 'homing') {
            s.bullets.push({
              id: s.nextId++,
              x: ox,
              y: by,
              dmg,
              crit,
              kind: 'rocket',
              phase: Math.random() * Math.PI * 2,
              targetId: volleyTargets.length
                ? volleyTargets[shotIdx % volleyTargets.length].id
                : undefined,
            });
          } else {
            s.bullets.push({
              id: s.nextId++,
              x: ox,
              y: by,
              dmg,
              crit,
              kind: 'normal',
              speed: stats.bulletSpeed,
            });
          }
        };
        // Stacking the same gun multiplies parallel shots (double already fires 2).
        const shots = (s.gun === 'double' ? 2 : 1) * s.gunLevel;
        // Bombs are the widest shot, so stacked bombs need extra room or they
        // overlap into one blob; every other gun keeps the tight default gap.
        const spacing = s.gun === 'bomb' ? 62 : 18;
        const spread = (shots - 1) * spacing;
        for (let i = 0; i < shots; i++) {
          fireOne(s.avatarX - spread / 2 + i * spacing, i);
        }
        // Specter's ghosts fire from their own hulls while they last. One shot
        // each rather than the full stacked pattern: a flat +2 per volley keeps
        // the bullet count (and the screen) sane at gun level ×4.
        if (s.phantomTime > 0) {
          fireOne(s.avatarX - PHANTOM_OFFSET, 0);
          fireOne(s.avatarX + PHANTOM_OFFSET, 1);
        }
      }

      // Raptor's rake, on its own cadence rather than the gun's: fans of claws
      // hose out for as long as the barrage lasts. Sits beside the auto-fire
      // (and after the bullet pass) for the same reason — a claw gets a frame
      // at its spawn point before it starts travelling.
      if (s.talonTime > 0) {
        s.talonTime = Math.max(0, s.talonTime - dt);
        s.talonTimer -= dt;
        if (s.talonTimer <= 0) {
          s.talonTimer = TALON_BURST_EVERY;
          fireTalonFan(s);
        }
      }

      // --- Staggered spawns ---------------------------------------------------
      // Valkyrie's rain and a boss payout both create a large population, and
      // creating a view costs far more than moving one. Released a few a frame
      // here rather than all on the frame that triggered them — which in both
      // cases is the busiest frame in the game. Sits beside the talon cadence
      // above because it is the same idea, and after the bullet pass for the
      // same reason: a new spawn gets one frame drawn where it started.
      if (s.spearQueue.length) {
        s.spearQueueT -= dt;
        if (s.spearQueueT <= 0) {
          s.spearQueueT = SPEAR_RELEASE_EVERY;
          for (let i = 0; i < SPEAR_RELEASE && s.spearQueue.length; i++) {
            launchSpear(s, s.spearQueue.shift()!);
          }
        }
      }
      if (s.coinQueue.length) {
        s.coinQueueT -= dt;
        if (s.coinQueueT <= 0) {
          s.coinQueueT = COIN_DROP_EVERY;
          releaseCoins(s);
        }
      }

      // Death animations: one clock each, the frame is derived at render time.
      s.explosions = s.explosions.filter((e) => {
        e.t += dt;
        return e.t < EXPLOSION_LIFE;
      });

      // Particles & floats
      s.particles = s.particles.filter((p) => {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 500 * dt;
        return p.life > 0;
      });
      s.floats = s.floats.filter((f) => {
        f.life -= dt;
        f.y -= 55 * dt;
        return f.life > 0;
      });

      s.shake = Math.max(0, s.shake - dt);
      // Roll this frame's camera offset here rather than in the render, which
      // must stay a pure read. Clamped to SHAKE_MAX so the world can never
      // slide further than the hardest hit in the game is allowed to throw it.
      if (s.shake > 0) {
        const amp = SHAKE_AMP * (Math.min(s.shake, SHAKE_MAX) / SHAKE_REF);
        shakeOffset.current.x = (Math.random() - 0.5) * amp;
        shakeOffset.current.y = (Math.random() - 0.5) * amp;
      } else {
        shakeOffset.current.x = 0;
        shakeOffset.current.y = 0;
      }
      s.hitFlash = Math.max(0, s.hitFlash - dt);

      // The bomb's whiteout, pushed to the native view (one flat full-screen
      // quad at an animated opacity — nothing to re-rasterize).
      if (s.bombFlash > 0) {
        s.bombFlash = Math.max(0, s.bombFlash - dt);
        bombFlashAnim.current.setValue((s.bombFlash / BOMB_FLASH_TIME) * BOMB_FLASH_ALPHA);
      }

      if (s.hearts <= 0) {
        // Out of hearts — the rocket goes down.
        overRef.current = true;
        play('gameover', 1);
        hapticFailure();
        onGameOver({
          coins: s.coins,
          score: s.score,
          bestMult: s.bestMult,
          grazes: s.grazes,
          altitude: Math.round(s.alt),
          crystals: s.crystals,
          chips: s.chips,
          alloy: s.alloy,
          wave: s.wave,
          // Everything the run contributed to lifetime totals. Assembled here
          // (rather than in App) so the loop stays the single owner of what a
          // run counted, and App only has to merge it.
          stats: {
            runs: 1,
            deaths: 1,
            timePlayed: s.elapsed,
            totalAltitude: Math.round(s.alt),
            // High-water marks: addStats keeps the max rather than summing.
            highestWave: s.wave,
            bestAltitude: Math.round(s.alt),
            bestScore: s.score,
            totalScore: s.score,
            bestMult: s.bestMult,
            grazes: s.grazes,
            kills: s.kills,
            eliteKills: s.eliteKills,
            miniBossKills: s.miniBossKills,
            giantBossKills: s.giantBossKills,
            bossKills: s.miniBossKills + s.giantBossKills,
            coinsCollected: s.coins,
            crystalsCollected: s.crystals,
            damageDealt: Math.round(s.damageDealt),
            shotsFired: s.shotsFired,
            shotsHit: s.shotsHit,
            pickupsCollected: s.pickupsCollected,
            heartsCollected: s.heartsCollected,
            bombsUsed: s.bombsUsed,
            specialsUsed: s.specialsUsed,
            perfectBosses: s.perfectBosses,
            flawlessWaves: s.flawlessWaves,
          },
        });
      }
    };

    if (!pausedRef.current) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = g.current;
  // The offsets themselves are rolled in update() — see shakeOffset. The render
  // only READS them, so it stays a pure function of state (it was calling
  // Math.random() twice per frame, which made the draw non-reproducible and
  // misbehaves under concurrent re-entry).
  //
  // When nothing is shaking every frame reuses ONE frozen transform, so the
  // play field's root prop is reference-identical and Fabric skips it entirely.
  // It used to allocate a fresh `[{translateX:0},{translateY:0}]` every frame
  // for the whole run.
  const shakeTransform = s.shake > 0 ? [{ translateX: shakeOffset.current.x }, { translateY: shakeOffset.current.y }] : NO_SHAKE;
  const tilt = s.dragging
    ? Math.max(-12, Math.min(12, (s.targetX - s.avatarX) * 0.12))
    : 0;

  // Player normal-shot art (avatar-specific). Source sprites point +x, so the
  // bolt is laid out horizontally (length × thickness) and rotated -90° to fly
  // up; the layout box is centered on the bullet so rotation keeps it centered.
  const shotLen = PLAYER_SHOT_LEN;
  const shotThick = PLAYER_SHOT_LEN * avatarShot.aspect;
  // Region B / boss bar inputs. Both memoize on primitives, so scanning here
  // costs a loop and reconciles nothing until a count actually changes.
  let aliveEnemies = 0;
  let waveTotal = 0;
  let bossCard: Card | undefined;
  for (const c of s.cards) {
    if (c.kind !== 'rage') continue;
    if (c.boss && !c.dead) bossCard = c;
    waveTotal++;
    if (!c.dead) aliveEnemies++;
  }
  const specialReady = s.specialCharge >= 1;
  const overcharged = s.specialCharge >= ENERGY_OVERCHARGE;

  return (
    <View
      testID="playfield"
      style={[styles.wrap, { backgroundColor: SPACE_BLACK }]}
      {...pan.panHandlers}
    >
      {/* One fixed environment for the whole run — the player's chosen
          background. Scrolled on the native side via bgAnims (no per-frame
          React render). */}
      {/* `tier` is the one prop here that ever changes, and it changes at most
          once every QUALITY_SAMPLE frames — so the memo still skips this whole
          subtree on essentially every frame. The sky is the largest sustained
          cost in the game (a full-screen fill per layer, every frame, whether
          the board is empty or not), which is why the governor reaches it. */}
      {/* DELIBERATELY OUTSIDE THE SHAKE LAYER.
          A screen shake reads as impact because the FOREGROUND moves against a
          fixed reference; sliding the distant sky with it actually weakens the
          punch, because nothing stays still for the eye to measure motion
          against. Keeping it out also means the one element that has to cover
          the screen through a shake never gets dragged off its own edge — which
          is what SHAKE_MAX_PX existed to compensate for, and why that constant
          can now stay at 0 without leaving a bare strip along one edge. */}
      <ParallaxBackground
        set={background}
        anims={bgAnims.current}
        planetAnim={planetAnim.current}
        tier={qTierRef.current}
      />
      <View style={[styles.shakeLayer, { transform: shakeTransform }]}>
        {/* The dark scrim that used to sit here is GONE — BG_DIM is baked into
            the background art itself (scripts/bake-bg-dim.mjs). It was a
            full-screen translucent quad drawn every frame for the entire run
            purely to darken the sky, and being translucent it also forced
            everything beneath it to be drawn and read back for the blend.
            Baking it is exactly equivalent and costs nothing at runtime. */}
        {/* Hidden pre-warm: warms the native image cache before the first shot. */}
        <Prewarm avatarShot={avatarShot} special={avatarSpecial} />
        {/* Player shots use the pack's projectile art: missiles for the normal
            and homing guns, the "S" crate for lobbed bombs. Lasers stay a
            drawn beam — no sprite fits a beam. Bullets are keyed by array
            index, NOT id: the oldest bullet leaves from the front and new
            ones append at the back, so a slot's mounted Image gets reused
            for the next bullet instead of tearing down and re-mounting
            (a fresh native Image starts blank while it loads, which made
            each new shot invisible for its first stretch of flight). */}
        {s.bullets.map((b, i) =>
          b.kind === 'bomb' ? (
            // Amber blast starburst — radial/symmetric, so no travel rotation.
            <Image
              key={i}
              source={SHOT_BOMB_IMG}
              resizeMode="contain"
              fadeDuration={0}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: SHOT_BOMB_W,
                height: SHOT_BOMB_H,
                transform: [
                  { translateX: b.x - SHOT_BOMB_W / 2 },
                  { translateY: b.y - SHOT_BOMB_H / 2 },
                ],
              }}
            />
          ) : b.kind === 'laser' ? (
            // Beam-bolt: laid out along its LASER_LEN reach (tip at b.y, tail
            // below) and rotated -90° so its bright head leads upward.
            <Image
              key={i}
              source={SHOT_LASER_IMG}
              resizeMode="contain"
              fadeDuration={0}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: SHOT_LASER_LEN,
                height: SHOT_LASER_THICK,
                transform: [
                  { translateX: b.x - SHOT_LASER_LEN / 2 },
                  { translateY: b.y + SHOT_LASER_LEN / 2 - SHOT_LASER_THICK / 2 },
                  { rotate: '-90deg' },
                ],
              }}
            />
          ) : b.kind === 'talon' ? (
            // Raptor's claw: the ship's own bolt stretched long and thin (the
            // distortion is what makes it read as a claw rather than a bolt)
            // and rotated onto its heading, which was CACHED at spawn — a claw
            // flies straight, so recomputing it here was pure waste.
            <Image
              key={i}
              source={avatarShot.src}
              resizeMode="stretch"
              fadeDuration={0}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: TALON_THICK,
                height: TALON_LEN,
                transform: [
                  { translateX: b.x - TALON_THICK / 2 },
                  { translateY: b.y - TALON_LEN / 2 },
                  { rotate: `${b.angle ?? 0}deg` },
                ],
              }}
            />
          ) : b.kind === 'spear' ? (
            // Valkyrie's spear: the same bolt stretched into a lance, laid onto
            // its own heading so a leaning spear points where it actually
            // falls. The source points UP and the spear falls DOWN, so a
            // straight drop is a 180° flip (+90 on top of the travel angle).
            // b.y is the tip, so the box centres half a shaft ABOVE it —
            // matching the span its hit test sweeps.
            <Image
              key={i}
              source={avatarShot.src}
              resizeMode="stretch"
              fadeDuration={0}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: SPEAR_THICK,
                height: SPEAR_LEN,
                transform: [
                  { translateX: b.x - SPEAR_THICK / 2 },
                  { translateY: b.y - SPEAR_LEN },
                  { rotate: `${b.angle ?? 180}deg` },
                ],
              }}
            />
          ) : b.kind === 'rocket' ? (
            <Image
              key={i}
              source={SHOT_HOMING_IMG}
              resizeMode="contain"
              fadeDuration={0}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: SHOT_HOMING_LEN,
                height: SHOT_HOMING_THICK,
                transform: [
                  { translateX: b.x - SHOT_HOMING_LEN / 2 },
                  { translateY: b.y - SHOT_HOMING_THICK / 2 },
                  { rotate: `${b.angle ?? -90}deg` },
                ],
              }}
            />
          ) : (
            // Normal shot: the avatar's signature bolt. The source art points
            // UP, which is exactly where this flies — so it needs no rotation
            // at all. (It used to be laid out horizontally and rotated -90°,
            // because the old art pointed +x.)
            <Image
              key={i}
              source={avatarShot.src}
              resizeMode="contain"
              fadeDuration={0}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: shotThick,
                height: shotLen,
                transform: [
                  { translateX: b.x - shotThick / 2 },
                  { translateY: b.y - shotLen / 2 },
                ],
              }}
            />
          )
        )}
        {s.enemyBullets.map((b, i) => {
          const artIdx = b.shot ?? -1;
          if (artIdx < 0) {
            return (
              <View
                key={i}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: b.size,
                  height: b.size,
                  borderRadius: b.size / 2,
                  backgroundColor: b.color,
                  borderWidth: 1.5,
                  borderColor: 'rgba(255,255,255,0.7)',
                  transform: [
                    { translateX: b.x - b.size / 2 },
                    { translateY: b.y - b.size / 2 },
                  ],
                }}
              />
            );
          }
          // Sprite bullets: sized off the same base as the plain dot, drawn at
          // the source art's aspect, rotated to face its direction of travel.
          // Box and heading are CACHED on the bullet (see enemyShotRender) —
          // they were an atan2, a divide and an object allocation per shot per
          // frame, and none of it changes while the shot flies.
          const bw = b.bw ?? b.size;
          const bh = b.bh ?? b.size;
          const angle = b.angle ?? 0;
          // No contrast underlay. There used to be a dark disc here, because the
          // old art was a flat `tintColor` silhouette with no internal luminance
          // and a solid crimson blob really did vanish into the crimson nebula.
          // The art is properly shaded now — bright core, dark rim — so it reads
          // against both a bright background and the void on its own, and the
          // disc only showed up as a halo behind it.
          return (
            <Image
              key={i}
              source={ENEMY_SHOTS[artIdx]}
              resizeMode="contain"
              fadeDuration={0}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: bw,
                height: bh,
                transform: [
                  { translateX: b.x - bw / 2 },
                  { translateY: b.y - bh / 2 },
                  { rotate: `${angle}deg` },
                ],
              }}
            />
          );
        })}
        {s.cards.map((c) => (
          <ObstacleView key={c.id} ob={c} avatarShot={avatarShot} />
        ))}
        {/* Nova's shockwave, over the enemies it's tearing through and under
            the ship. Mounted for the run and animated natively — see NovaRing. */}
        {avatarSpecial === 'nova' && (
          <NovaRing
            x={novaAnim.current.x}
            y={novaAnim.current.y}
            scale={novaAnim.current.scale}
            opacity={novaAnim.current.opacity}
            core={novaAnim.current.core}
          />
        )}
        {/* Specter's ghost wingmen: see-through copies of your own hull flying
            in formation and firing with you. Drawn just under the real ship, a
            touch smaller, and faded out over their last half-second. */}
        {s.phantomTime > 0 &&
          [-PHANTOM_OFFSET, PHANTOM_OFFSET].map((dx) => (
            <View
              key={dx}
              pointerEvents="none"
              style={[
                styles.rocket,
                {
                  opacity: PHANTOM_ALPHA * Math.min(1, s.phantomTime / 0.5),
                  transform: [
                    { translateX: s.avatarX - 36 + dx },
                    { translateY: s.avatarY - 22 },
                    { rotate: `${tilt}deg` },
                    { scale: 1.3 },
                  ],
                },
              ]}
            >
              <Image source={avatarImage} style={styles.jetImg} resizeMode="contain" fadeDuration={0} />
            </View>
          ))}
        {/* Shield bubble: a bright hoop around the hull while the boon holds, so
            "nothing can touch me" is legible at a glance. It thins out over the
            last second as a warning that it's about to drop. */}
        {boonActive(s.boons, 'shield') && s.shieldLeft > 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.shieldRing,
              {
                // Two independent warnings, because the shield now has two ways
                // to end: it thins over its last second (time) and dims as its
                // charges are spent (hits). A player who can see the hoop
                // weakening can decide to start dodging again before it pops.
                opacity:
                  Math.min(1, (s.boons.shield ?? 0) / 1) *
                  0.85 *
                  (0.45 + 0.55 * (s.shieldLeft / SHIELD_HITS)),
                transform: [
                  { translateX: s.avatarX - SHIELD_RING / 2 },
                  // Centred on the DRAWN HULL, not the hitbox. Those are ~15px
                  // apart (see AVATAR_HULL_CY), and using the hitbox centre is
                  // what put the bubble behind the ship with its nose sticking
                  // out the front.
                  { translateY: s.avatarY + AVATAR_HULL_CY - SHIELD_RING / 2 },
                ],
              },
            ]}
          />
        )}
        {/* Ironclad's BULWARK shell, over the shield hoop and under the hull. */}
        {s.bulwarkTime > 0 && (
          <BulwarkShell
            x={s.avatarX}
            // Same hull centre as the shield hoop — the shell had the identical
            // offset, for the identical reason.
            y={s.avatarY + AVATAR_HULL_CY}
            time={s.bulwarkTime}
            over={s.bulwarkTime > BULWARK_TIME}
          />
        )}
        {/* The vehicle: an image avatar (e.g. jet) flies as-is; otherwise the
            emoji rides a little rocket with a nose cone and flickering flame. */}
        <View
          style={[
            styles.rocket,
            {
              // These three are AVATAR_HULL_CY's inputs — it is derived from
              // them so the shield and Bulwark hoops stay centred on the hull if
              // this is ever retuned. Changing them here changes the hoops too.
              transform: [
                { translateX: s.avatarX + AVATAR_ART_DX },
                { translateY: s.avatarY + AVATAR_ART_DY },
                { rotate: `${tilt}deg` },
                { scale: AVATAR_ART_SCALE },
              ],
            },
          ]}
          pointerEvents="none"
        >
          <Image source={avatarImage} style={styles.jetImg} resizeMode="contain" fadeDuration={0} />
        </View>
        {/* Death fireballs, under the debris so sparks read in front of them.
            Few enough to stay on React (MAX_EXPLOSIONS).

            Each is a CLIP the size of one frame, holding a strip of all ten
            (see EXPLOSION_SHEETS). Stepping the animation slides the strip; the
            `source` never changes. It used to swap source ten times per
            explosion, which is a trip through the native image pipeline each
            time and peaked at ~180 a second on the frame a formation died.

            Keyed by id: a new explosion must mount fresh at frame 0 rather than
            inherit a recycled slot mid-animation. */}
        {s.explosions.map((e) => {
          const frame = Math.min(
            EXPLOSION_FRAMES - 1,
            Math.floor(e.t * EXPLOSION_FPS)
          );
          return (
            <View
              key={e.id}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: e.size,
                height: e.size,
                overflow: 'hidden', // the window that makes a strip a sprite
                transform: [
                  { translateX: e.x - e.size / 2 },
                  { translateY: e.y - e.size / 2 },
                ],
              }}
            >
              <Image
                source={EXPLOSION_SHEETS[e.style]}
                fadeDuration={0}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: e.size * EXPLOSION_FRAMES,
                  height: e.size,
                  // A transform, NOT `left` — the whole point is that advancing
                  // a frame must not re-run layout on the strip.
                  transform: [{ translateX: -frame * e.size }],
                }}
              />
            </View>
          );
        })}
        {/* A fixed pool of views; the loop fills the front slots. Rendered
            with this frame rather than written imperatively — see ParticleLayer.
            Sparks lose their rounded corners once the governor has dropped a
            tier: the cheaper primitive is invisible at spark size and speed. */}
        <ParticleLayer particles={s.particles} squared={qTierRef.current > 0} />
        {s.floats.map((f) => (
          <FloatTextView key={f.id} f={f} />
        ))}
      </View>
      {s.hitFlash > 0 && (
        <View
          style={[styles.vignette, { opacity: (s.hitFlash / 0.3) * 0.35 }]}
          pointerEvents="none"
        />
      )}
      {/* Nova's whiteout, over the whole screen and outside the shake layer. */}
      {avatarSpecial === 'nova' && <NovaFlash opacity={novaAnim.current.flash} />}
      {/* The bomb's whiteout, on the same native-opacity trick as Nova's. */}
      <BombFlash opacity={bombFlashAnim.current} />
      {PERF_OVERLAY && <PerfOverlay stats={perf} />}
      <HUD
        score={s.score}
        coins={s.coins}
        alt={s.alt}
        gun={s.gun}
        gunTime={s.gunTime}
        gunLevel={s.gunLevel}
        boons={s.boons}
        boonKey={boonChipKey(s.boons)}
        multiplier={multiplierFor(s.chain)}
        chainFrac={chainWindowFrac(s)}
      />
      <WaveHeader wave={s.wave} alive={aliveEnemies} total={waveTotal} boss={bossCard?.boss} />
      {bossCard && (
        <BossBar hp={bossCard.hp} maxHp={bossCard.maxHp} kind={bossCard.boss ?? 'mini'} />
      )}
      <LowHullPulse active={s.hearts === 1} reduceMotion={reduceMotion} />
      <HealthBar hearts={s.hearts} maxHearts={s.maxHearts} />
      {!paused && (
        <>
          <Pressable testID="pause" onPress={doPause} hitSlop={12} style={styles.pauseBtn}>
            <Icon name="pause" size={15} color={PALETTE.ink} />
          </Pressable>
          {/* Bombs: a held resource, so the button shows the count and greys out
              when the bay is empty. Mirrors FIRE on the opposite thumb. */}
          <BombButton count={s.bombs} onPress={doBomb} />
          {/* The ship's ultimate. `ready` is derived, not stored: the button is
              memoized on primitives, so recomputing it every frame reconciles
              nothing until it actually flips. */}
          <SpecialButton
            charge={chargeAnim.current}
            pulse={specialPulse.current}
            overcharged={overcharged}
            ready={specialReady}
            label={SPECIALS[avatarSpecial].name}
            onPress={doSpecial}
          />
        </>
      )}
      {paused && (
        <View style={styles.pauseOverlay}>
          <Text style={styles.pauseTitle}>PAUSED</Text>
          <Text style={styles.pauseDist}>{Math.round(s.alt)}m</Text>
          <Pressable
            onPress={doContinue}
            style={({ pressed }) => [styles.pausePrimary, pressed && styles.pausePressed]}
          >
            <Text style={styles.pausePrimaryTxt}>CONTINUE</Text>
          </Pressable>
          <Pressable
            onPress={doNewGame}
            style={({ pressed }) => [styles.pauseSecondary, pressed && styles.pausePressed]}
          >
            <Text style={styles.pauseSecondaryTxt}>NEW GAME</Text>
          </Pressable>
          <Pressable
            onPress={doHome}
            style={({ pressed }) => [styles.pauseSecondary, pressed && styles.pausePressed]}
          >
            <Text style={styles.pauseSecondaryTxt}>RETURN TO HOME</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function spawnWave(s: GameState, wave: number) {
  // Every 10th wave: a giant boss. Every other 5th wave: a mini boss.
  // Otherwise: a formation of enemies that hold near the top until destroyed.
  if (wave % 5 === 0) {
    const giant = wave % 10 === 0;
    // Zeroed as the boss ARRIVES, not just when one dies: otherwise hits taken
    // during the ordinary waves beforehand would count against it and a
    // "perfect" kill would be impossible after the first scratch of the run.
    s.bossDamageTaken = 0;
    const hit = giant ? BOSS_GIANT_HIT : BOSS_MINI_HIT;
    const hp = giant ? BOSS_GIANT_HP(wave) : BOSS_MINI_HP(wave);
    s.cards.push({
      id: s.nextId++,
      kind: 'rage',
      lane: Math.floor(LANES / 2),
      y: -hit - 60, // looms in from above
      h: hit,
      w: hit,
      emoji: '',
      hp,
      maxHp: hp,
      hitT: 0,
      holdY: FORMATION_TOP + (giant ? 30 : 10),
      shipIdx: shipForWave(wave),
      boss: giant ? 'giant' : 'mini',
      cx: SCREEN.W / 2,
      dead: false,
      deadT: 0,
      nearMissChecked: false,
    });
    return;
  }
  const count = Math.min(WAVE_MAX_ENEMIES, WAVE_BASE_ENEMIES + (wave - 1));
  let placed = 0;
  let row = 0;
  while (placed < count) {
    const inRow = Math.min(LANES, count - placed);
    const startLane = Math.floor((LANES - inRow) / 2); // center each row
    for (let k = 0; k < inRow; k++) {
      s.cards.push(
        makeWaveEnemy(s, startLane + k, FORMATION_TOP + row * FORMATION_ROW_GAP, wave, row)
      );
      placed++;
    }
    row++;
  }
}

// One sweep of Raptor's rake: a wide fan of piercing claws thrown from the
// nose. The whole fan swings side to side over the barrage (a slow sine on run
// time), so successive volleys rake across the sky instead of stacking on the
// same seven lines.
function fireTalonFan(s: GameState): void {
  const sweep = Math.sin(s.elapsed * TALON_SWEEP_FREQ) * TALON_SWEEP_AMP;
  const by = s.avatarY + 10;
  for (let i = 0; i < TALON_COUNT; i++) {
    // -90° is straight up; the fan opens evenly to either side of it.
    const a = -Math.PI / 2 + sweep + (i / (TALON_COUNT - 1) - 0.5) * TALON_SPREAD;
    s.bullets.push({
      id: s.nextId++,
      x: s.avatarX,
      y: by,
      dmg: TALON_DMG,
      kind: 'talon',
      vx: Math.cos(a) * TALON_SPEED,
      vy: Math.sin(a) * TALON_SPEED,
      hits: [],
      // Cached so the render is a pure read. A claw flies a straight line, so
      // its heading is fixed the moment it leaves — the render was recomputing
      // this atan2 for every live claw on every frame, which at peak barrage
      // was dozens of them sixty times a second. The source art points UP, so
      // the sprite rotation is the travel angle plus 90°.
      angle: (a * 180) / Math.PI + 90,
    });
  }
}

function makeEnemy(s: GameState, lane: number, holdY: number, wave: number, row: number): Card {
  const hp = baseWaveHp(wave); // tougher every wave
  return {
    id: s.nextId++,
    kind: 'rage',
    lane,
    y: -OB_VIS - row * FORMATION_ROW_GAP - 20, // stream in from above, staggered by row
    h: OB_HIT,
    emoji: '',
    hp,
    maxHp: hp,
    hitT: 0,
    holdY,
    homeX: laneX(lane), // formation anchor the movement behaviours work around
    shipIdx: shipForWave(wave),
    dead: false,
    deadT: 0,
    nearMissChecked: false,
  };
}

/**
 * A formation enemy with its archetype and (maybe) elite modifier rolled.
 *
 * Split from makeEnemy so splitter children — which need a plain card with
 * hand-set stats — can still use the bare constructor.
 */
function makeWaveEnemy(s: GameState, lane: number, holdY: number, wave: number, row: number): Card {
  const card = makeEnemy(s, lane, holdY, wave, row);
  applyArchetype(card, rollArchetype(wave), rollElite(wave), wave);
  return card;
}

// A boss payout: coins fanned out around the kill point, each falling from
// there so they still have to be flown through. Positions are clamped to the
// play area so an edge-swaying boss can't drop coins out of reach.
/**
 * Queue a coin payout. The positions are all decided here — the fan's shape is
 * a property of the payout, not of when each coin happens to be created — but
 * the cards themselves are made a few a frame by the drain in update(). See
 * GameState.coinQueue for why.
 */
function dropCoins(s: GameState, x: number, y: number, count: number): void {
  const spread = (count - 1) * COIN_DROP_SPACING;
  const minX = FEED_PAD + COIN_VIS / 2;
  const maxX = SCREEN.W - FEED_PAD - COIN_VIS / 2;
  for (let i = 0; i < count; i++) {
    s.coinQueue.push({
      cx: Math.max(minX, Math.min(maxX, x - spread / 2 + i * COIN_DROP_SPACING)),
      y: y + (Math.random() - 0.5) * 24, // stagger so they don't fall as one line
    });
  }
}

/** Create the next few queued coins. */
function releaseCoins(s: GameState): void {
  for (let i = 0; i < COIN_DROP_RELEASE && s.coinQueue.length; i++) {
    const q = s.coinQueue.shift()!;
    const coin = makeCard(s, 0, 'coin'); // lane is unused once cx is set
    coin.cx = q.cx;
    coin.y = q.y;
    s.cards.push(coin);
  }
}

/**
 * Launch one spear from a column, rolling its own drop height, speed and lean —
 * so the rain arrives ragged instead of as one clean sweep.
 */
function launchSpear(s: GameState, x: number): void {
  const tilt = (Math.random() - 0.5) * 2 * SPEAR_TILT;
  const speed = SPEAR_SPEED * (1 + (Math.random() - 0.5) * 2 * SPEAR_SPEED_VAR);
  const vx = Math.sin(tilt) * speed;
  const vy = Math.cos(tilt) * speed;
  s.bullets.push({
    id: s.nextId++,
    x,
    y: -20 - Math.random() * SPEAR_DROP_BAND, // tip; shaft trails above it
    dmg: SPEAR_DMG,
    kind: 'spear',
    vx,
    vy,
    hits: [],
    // Cached for the same reason a talon's is: a spear falls on a fixed lean,
    // so the render must not recompute this every frame for the whole rain.
    // The art points UP and the spear falls DOWN, so a straight drop is 180°.
    angle: (Math.atan2(vy, vx) * 180) / Math.PI + 90,
  });
}

function makeCard(s: GameState, lane: number, kind: 'heart' | 'gift' | 'coin' | 'boon'): Card {
  // Pickups (heart / coin / gun / utility boon) that fall down toward the
  // player. A gun drop rolls which gun it grants here, at spawn, so it can fall
  // wearing that gun's art — you read what's coming before deciding whether to
  // go for it. Boons work the same way, rolled by the caller.
  const gun = kind === 'gift' ? GIFT_GUNS[Math.floor(Math.random() * GIFT_GUNS.length)] : undefined;
  return {
    id: s.nextId++,
    kind,
    lane,
    y: -OB_VIS - 10,
    h: OB_HIT,
    emoji: '',
    gun,
    hp: 1,
    maxHp: 1,
    hitT: 0,
    dead: false,
    deadT: 0,
    nearMissChecked: false,
  };
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  shakeLayer: {
    flex: 1,
  },
  // Parked at the origin and moved by translate — see the transform note above.
  rocket: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 72,
    alignItems: 'center',
  },
  jetImg: {
    width: AVATAR_IMG_W,
    height: AVATAR_IMG_H,
    marginTop: 2,
  },
  prewarm: {
    position: 'absolute',
    left: -300, // parked off-screen; images still load and warm the cache
    top: 0,
  },
  vignette: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: PALETTE.threat,
  },
  novaFlash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: NOVA_FLASH_COLOR,
  },
  bombFlash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BOMB_FLASH_COLOR,
  },
  shieldRing: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SHIELD_RING,
    height: SHIELD_RING,
    borderRadius: SHIELD_RING / 2,
    borderWidth: 2.5,
    borderColor: SHIELD_COLOR,
    backgroundColor: 'rgba(72,214,255,0.10)',
  },
  // --- Bomb button (mirrors the FIRE button on the opposite thumb) ---
  bombBtn: {
    position: 'absolute',
    left: BOMB_BTN_LEFT,
    bottom: BOMB_BTN_BOTTOM,
    width: BOMB_BTN_SIZE,
    height: BOMB_BTN_SIZE,
    borderRadius: BOMB_BTN_SIZE / 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 2,
    borderColor: PALETTE.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bombBtnEmpty: {
    borderColor: 'rgba(255,255,255,0.18)',
    opacity: 0.5,
  },
  bombIcon: {
    fontSize: 22,
  },
  bombCount: {
    color: PALETTE.amber,
    fontSize: 11,
    fontFamily: FONTS.data,
    letterSpacing: 1,
    marginTop: -1,
  },
  bombCountEmpty: {
    color: PALETTE.inkDim,
  },
  bombPressed: { opacity: 0.7 },
  pauseBtn: {
    position: 'absolute',
    top: 50,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseIcon: {
    color: PALETTE.ink,
    fontSize: 14,
    fontFamily: FONTS.display,
    letterSpacing: 1,
  },
  pauseOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(6,8,16,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  pauseTitle: {
    ...TYPE.displayL,
    color: PALETTE.ink,
    fontSize: 40,
  },
  pauseDist: {
    color: PALETTE.inkDim,
    fontSize: 16,
    fontFamily: FONTS.display,
    letterSpacing: 1,
    marginTop: 6,
    marginBottom: 34,
  },
  pausePrimary: {
    backgroundColor: PALETTE.plasma,
    paddingVertical: 16,
    borderRadius: 14,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginBottom: 12,
  },
  pausePrimaryTxt: {
    color: '#04121A',
    fontSize: 16,
    fontFamily: FONTS.display,
    letterSpacing: 2,
  },
  pauseSecondary: {
    paddingVertical: 15,
    borderRadius: 14,
    alignSelf: 'stretch',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    marginBottom: 12,
  },
  pauseSecondaryTxt: {
    color: PALETTE.ink,
    fontSize: 14,
    fontFamily: FONTS.display,
    letterSpacing: 2,
  },
  pausePressed: { opacity: 0.7 },
});
