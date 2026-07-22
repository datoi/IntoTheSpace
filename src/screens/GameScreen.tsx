import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, PanResponder, Pressable, AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import ObstacleView from '../components/Obstacle';
import { ParticleView, FloatTextView, HUD, HealthBar } from '../components/Effects';
import { Card, Bullet, EnemyBullet, GunKind, GameState, RunResult } from '../game/types';
import { play, playPop } from '../game/sounds';
import {
  SCREEN,
  LANES,
  laneX,
  FEED_PAD,
  AVATAR_SIZE,
  AVATAR_Y,
  OB_VIS,
  OB_HIT,
  BASE_SPEED,
  MAX_SPEED,
  HEARTS_START,
  HEARTS_MAX,
  HEART_EVERY,
  COIN_EVERY,
  COIN_GOLD,
  COIN_VIS,
  COIN_DROP_SPACING,
  BOSS_MINI_COINS,
  BOSS_GIANT_COINS,
  RAMP_ALT,
  ALT_RATE_MIN,
  ALT_RATE_MAX,
  FIRE_RATE,
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
  GUN_PICKUP_EMOJI,
  ENEMY_FIRE_EVERY,
  ENEMY_BULLET_SPEED,
  ZIGZAG_WAVE,
  HOMING_WAVE,
  CHARGE_WAVE,
  ENEMY_BULLET_SIZE,
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
  ENEMY_DESCEND_SPEED,
  WAVE_GAP,
  WAVE_BASE_ENEMIES,
  WAVE_MAX_ENEMIES,
  BgSet,
  BG_PX_PER_M,
  BG_DIM,
  shipForWave,
  BOSS_MINI_HIT,
  BOSS_GIANT_HIT,
  BOSS_MINI_HP,
  BOSS_GIANT_HP,
  BOSS_SWAY_AMP,
  BOSS_SWAY_FREQ,
  SHOT_HOMING_IMG,
  SHOT_BOMB_IMG,
  SHOT_LASER_IMG,
  SHOT_BOMB_W,
  SHOT_BOMB_H,
  SHOT_LASER_LEN,
  SHOT_LASER_THICK,
  SHOT_HOMING_LEN,
  SHOT_HOMING_THICK,
  ENEMY_BULLET_ART_SCALE,
  AVATAR_IMG_W,
  AVATAR_IMG_H,
  ENEMY_SHOTS,
  ENEMY_SHOT_ASPECT,
  enemyShotForShip,
  PLAYER_SHOT_LEN,
  ShotArt,
  GUN_LABEL,
  PALETTE,
} from '../game/constants';

interface Props {
  best: number;
  avatarEmoji: string;
  avatarImage?: number; // require()'d avatar image, if the selected avatar has one
  avatarShot: ShotArt; // the selected ship's signature fire-shot art
  background: BgSet; // the one environment shown for the whole run
  resume?: GameState | null; // restore an in-progress run instead of starting fresh
  startPaused?: boolean; // resumed runs open on the pause screen
  onGameOver: (result: RunResult) => void;
  onPersist: (state: GameState) => void; // snapshot the run (pause / background / home)
  onClearRun: () => void; // discard the saved run (new game / game over)
  onHome: () => void; // leave to the main menu
}

function fresh(): GameState {
  return {
    avatarX: laneX(1),
    avatarY: AVATAR_Y,
    targetX: laneX(1),
    targetY: AVATAR_Y,
    dragDX: 0,
    dragDY: 0,
    dragging: false,
    alt: 0,
    wave: 0,
    waveClearTimer: 0.8, // first wave drops in quickly
    gun: 'single',
    gunTime: 0,
    gunLevel: 1,
    fireTimer: 0.4,
    giftTimer: 8, // first gun drop comes early to teach the mechanic
    heartTimer: HEART_EVERY,
    coinTimer: 3, // first coin drops early so the currency is obvious
    enemyFireTimer: 2.5,
    bullets: [],
    enemyBullets: [],
    cards: [],
    particles: [],
    floats: [],
    elapsed: 0,
    distTimer: 0,
    hearts: HEARTS_START,
    coins: 0,
    shake: 0,
    hitFlash: 0,
    nextId: 1,
  };
}

const GIFT_GUNS: GunKind[] = ['double', 'bomb', 'laser', 'homing'];

const isHazard = (c: Card) => !c.dead && c.kind === 'rage';

// Effective center x: a charging enemy moves freely; otherwise it's lane-locked.
const cardX = (c: Card) => c.cx ?? laneX(c.lane);

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

// Enemies already claimed by other rockets in flight.
function claimedTargets(bullets: Bullet[], self: Bullet): Set<number> {
  const claimed = new Set<number>();
  for (const o of bullets) {
    if (o !== self && o.kind === 'rocket' && o.targetId !== undefined) claimed.add(o.targetId);
  }
  return claimed;
}

const SPACE_BLACK = '#04060E';

// One parallax background set: optional static base + layers scrolling down
// at different speeds (far slowest → near fastest), driven by altitude.
// Non-seamless art tiles with mirrored copies (scaleY: -1 on odd tiles) to
// hide the seam; seamless tiles repeat plainly.
function renderBgSet(set: BgSet, alt: number, alpha: number, keyPrefix: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  if (set.base !== undefined) {
    nodes.push(
      <Image
        key={`${keyPrefix}base`}
        source={set.base}
        resizeMode="cover"
        fadeDuration={0}
        style={{ position: 'absolute', left: 0, top: 0, width: SCREEN.W, height: SCREEN.H, opacity: alpha }}
      />
    );
  }
  const tileH = SCREEN.W * set.aspect;
  // Tiles are keyed by a fixed ring of slots, NOT by tile index: as the offset
  // grows the index walks downward, so keying by index unmounts the tile
  // leaving the screen and mounts a fresh one at the other edge — and a fresh
  // native Image paints blank until it decodes, which read as a background
  // blink mid-scroll (fadeDuration=0 hid Android's fade-in but not the decode
  // gap). Reusing a mounted Image just moves it; the source never re-decodes.
  // The ring is even-sized so a slot's mirror parity, which follows the tile
  // index's parity, stays constant across the wrap.
  const ringBase = Math.ceil(SCREEN.H / tileH) + 2;
  const ring = ringBase + (ringBase % 2);
  for (let li = 0; li < set.layers.length; li++) {
    const L = set.layers[li];
    const o = alt * BG_PX_PER_M * L.speed;
    // Tile n sits at y = n·tileH + o; o grows, tiles move down, n decreases
    // over time. Cover the screen from the top edge down. Tiles are drawn 1px
    // taller than their pitch so float rounding can't open hairline seams.
    for (let n = Math.floor(-o / tileH); n * tileH + o < SCREEN.H; n++) {
      const flipped = set.mirror && ((n % 2) + 2) % 2 === 1;
      nodes.push(
        <Image
          key={`${keyPrefix}l${li}_s${((n % ring) + ring) % ring}`}
          source={L.src}
          resizeMode="stretch"
          fadeDuration={0}
          style={{
            position: 'absolute',
            left: 0,
            top: n * tileH + o - 0.5,
            width: SCREEN.W,
            height: tileH + 1,
            opacity: L.alpha * alpha,
            transform: flipped ? [{ scaleY: -1 }] : undefined,
          }}
        />
      );
    }
  }
  return nodes;
}

// How far from the avatar's center a touch still counts as grabbing it.
const GRAB_RADIUS = 80;

export default function GameScreen({
  best,
  avatarEmoji,
  avatarImage,
  avatarShot,
  background,
  resume,
  startPaused,
  onGameOver,
  onPersist,
  onClearRun,
  onHome,
}: Props) {
  // Merge onto a fresh state so runs saved by an older build (missing newer
  // fields like enemyBullets) don't crash on resume.
  const g = useRef<GameState>(resume ? { ...fresh(), ...resume } : fresh());
  const overRef = useRef(false);
  const pausedRef = useRef(!!startPaused);
  const [paused, setPaused] = useState(!!startPaused);
  const resumeLoopRef = useRef<() => void>(() => {});
  const [, setFrame] = useState(0);

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
    g.current = fresh();
    overRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    onClearRun();
    resumeLoopRef.current();
  }, [onClearRun]);

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

  // Touch the rocket to grab it; it sticks to the finger (keeping the grab
  // offset) and follows it anywhere until released.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !pausedRef.current,
      onMoveShouldSetPanResponder: () => !pausedRef.current,
      onPanResponderGrant: (evt) => {
        const s = g.current;
        const { pageX, pageY } = evt.nativeEvent;
        const cx = s.avatarX;
        const cy = s.avatarY + AVATAR_SIZE / 2;
        if (Math.hypot(pageX - cx, pageY - cy) <= GRAB_RADIUS) {
          s.dragging = true;
          s.dragDX = s.avatarX - pageX;
          s.dragDY = s.avatarY - pageY;
          s.targetX = s.avatarX;
          s.targetY = s.avatarY;
          play('whoosh', 0.5);
          Haptics.selectionAsync().catch(() => {});
        }
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

    const tick = (now: number) => {
      if (overRef.current || pausedRef.current) return;
      if (!last) last = now;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      update(dt);
      setFrame((f) => f + 1);
      raf = requestAnimationFrame(tick);
    };

    // Called to (re)start the loop after a pause; resets dt so no time jump.
    resumeLoopRef.current = () => {
      last = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    const burst = (x: number, y: number, color: string, count = 10) => {
      const s = g.current;
      for (let i = 0; i < count; i++) {
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

    const float = (x: number, y: number, text: string, color: string) => {
      const s = g.current;
      s.floats.push({ id: s.nextId++, x, y, text, color, life: 0.8 });
    };

    const update = (dt: number) => {
      const s = g.current;
      s.elapsed += dt;

      // Altitude drives everything: the higher you climb, the harder the
      // engines burn — and the faster the feed rains down on you.
      const r = Math.min(s.alt / RAMP_ALT, 1);
      s.alt += (ALT_RATE_MIN + (ALT_RATE_MAX - ALT_RATE_MIN) * r) * dt;
      const speed = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * r;

      // Rocket sticks to the finger while dragging (tight lerp kills jitter
      // without feeling laggy), clamped to the play area.
      if (s.dragging) {
        const k = Math.min(30 * dt, 1);
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

      // Waves: enemies hold in a formation up top until you destroy them all,
      // then the next (harder) wave drops in.
      const enemiesAlive = s.cards.some((c) => c.kind === 'rage' && !c.dead);
      if (enemiesAlive) {
        s.waveClearTimer = WAVE_GAP;
      } else {
        s.waveClearTimer -= dt;
        if (s.waveClearTimer <= 0) {
          s.wave += 1;
          s.waveClearTimer = WAVE_GAP;
          spawnWave(s, s.wave);
          const label =
            s.wave % 10 === 0
              ? `☠️ WAVE ${s.wave} — GIANT BOSS`
              : s.wave % 5 === 0
                ? `⚠️ WAVE ${s.wave} — MINI BOSS`
                : `WAVE ${s.wave}`;
          float(SCREEN.W / 2, SCREEN.H * 0.34, label, PALETTE.bell);
        }
      }

      const avLeft = s.avatarX - AVATAR_SIZE / 2 + 6;
      const avRight = s.avatarX + AVATAR_SIZE / 2 - 6;
      const avTop = s.avatarY + 6;
      const avBottom = s.avatarY + AVATAR_SIZE - 6;

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
          // Wave 20+: a wounded enemy breaks formation and dives at the player
          // (bosses never charge — they hold and sway).
          if (s.wave >= CHARGE_WAVE && !c.charging && !c.boss && c.hp <= 2 && c.holdY !== undefined) {
            c.charging = true;
            c.cx = laneX(c.lane);
          }
          if (c.charging) {
            const curX = c.cx ?? laneX(c.lane);
            const dx = s.avatarX - curX;
            const dy = s.avatarY + AVATAR_SIZE / 2 - (c.y + c.h / 2);
            const d = Math.hypot(dx, dy) || 1;
            c.cx = curX + (dx / d) * CHARGE_SPEED * dt;
            c.y += (dy / d) * CHARGE_SPEED * dt;
          } else if (c.holdY !== undefined && c.y < c.holdY) {
            // Drop into its formation slot, then hold there.
            c.y = Math.min(c.holdY, c.y + ENEMY_DESCEND_SPEED * dt);
          } else if (c.boss) {
            // Bosses sway side to side across the top of the screen. The phase
            // is anchored to the moment the sway starts, not to run time —
            // otherwise sin() is already mid-swing when the boss lands and it
            // snaps sideways the frame it stops descending.
            if (c.swayT0 === undefined) c.swayT0 = s.elapsed;
            c.cx = SCREEN.W / 2 + Math.sin((s.elapsed - c.swayT0) * BOSS_SWAY_FREQ) * SCREEN.W * BOSS_SWAY_AMP;
          }
        } else {
          // Pickups (heart / gift) fall down toward the player.
          c.y += speed * dt;
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
            s.hearts = Math.min(HEARTS_MAX, s.hearts + 1);
            playPop(4);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            burst(s.avatarX, s.avatarY, PALETTE.moment, 12);
            float(s.avatarX, s.avatarY - 40, `+1 ❤️`, PALETTE.moment);
          } else if (c.kind === 'coin') {
            s.coins += 1;
            playPop(2);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            burst(s.avatarX, s.avatarY, COIN_GOLD, 10);
            float(s.avatarX, s.avatarY - 40, '+1 COIN', COIN_GOLD);
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
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            burst(s.avatarX, s.avatarY, PALETTE.bell, 14);
            const lbl = s.gunLevel > 1 ? `${GUN_LABEL[s.gun]} ×${s.gunLevel}` : GUN_LABEL[s.gun];
            float(s.avatarX, s.avatarY - 40, lbl, PALETTE.bell);
          } else {
            s.hearts -= 1;
            s.shake = 0.28;
            s.hitFlash = 0.3;
            play('buzz', 0.9);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
            burst(s.avatarX, s.avatarY, PALETTE.rage, 14);
            float(s.avatarX, s.avatarY - 40, '-1 💔', PALETTE.rage);
          }
        }

        if (!c.dead && c.y < SCREEN.H + 40) keptCards.push(c);
        else if (c.dead) keptCards.push(c);
      }
      s.cards = keptCards;

      // Enemies shoot back: every so often a visible rocket fires a shot aimed
      // at the player's current position (Galaxy-Attack style).
      s.enemyFireTimer -= dt;
      if (s.enemyFireTimer <= 0) {
        // Each wave fires faster, in bigger volleys, for more damage.
        s.enemyFireTimer =
          Math.max(0.75, ENEMY_FIRE_EVERY / (1 + s.wave * 0.09)) * (0.7 + Math.random() * 0.6);
        const shooters = s.cards.filter((c) => !c.dead && c.kind === 'rage' && c.y > 0);
        if (shooters.length) {
          const kind: EnemyBullet['kind'] =
            s.wave >= HOMING_WAVE ? 'homing' : s.wave >= ZIGZAG_WAVE ? 'zigzag' : 'straight';
          // Locking rockets come one at a time; other shots can volley.
          const volley = kind === 'homing' ? 1 : Math.min(shooters.length, 3, 1 + Math.floor(s.wave / 5));
          const bSize = ENEMY_BULLET_SIZE;
          const color = WAVE_COLORS[(s.wave - 1) % WAVE_COLORS.length];
          const bSpeed = kind === 'homing' ? ENEMY_HOMING_SPEED : ENEMY_BULLET_SPEED;
          const life = kind === 'homing' ? ENEMY_HOMING_LIFE : ENEMY_BULLET_LIFE;
          for (let k = 0; k < volley; k++) {
            const sh = shooters[Math.floor(Math.random() * shooters.length)];
            const ox = cardX(sh);
            const oy = sh.y + sh.h;
            const dx = s.avatarX - ox;
            const dy = s.avatarY + AVATAR_SIZE / 2 - oy;
            const d = Math.hypot(dx, dy) || 1;
            s.enemyBullets.push({
              id: s.nextId++,
              x: ox,
              y: oy,
              vx: (dx / d) * bSpeed,
              vy: (dy / d) * bSpeed,
              kind,
              color,
              size: bSize,
              phase: Math.random() * Math.PI * 2,
              life,
              shipIdx: sh.shipIdx ?? 0,
            });
          }
        }
        // Bosses fire their own aimed fan on top of the volley: mini 2 shots,
        // giant 3, slightly bigger than regular fire.
        for (const bc of s.cards) {
          if (bc.dead || !bc.boss || bc.y <= 0) continue;
          const fan = bc.boss === 'giant' ? 3 : 2;
          const ox = cardX(bc);
          const oy = bc.y + bc.h;
          const baseA = Math.atan2(s.avatarY + AVATAR_SIZE / 2 - oy, s.avatarX - ox);
          const color = WAVE_COLORS[(s.wave - 1) % WAVE_COLORS.length];
          for (let k = 0; k < fan; k++) {
            const a = baseA + (k - (fan - 1) / 2) * 0.28;
            s.enemyBullets.push({
              id: s.nextId++,
              x: ox,
              y: oy,
              vx: Math.cos(a) * ENEMY_BULLET_SPEED,
              vy: Math.sin(a) * ENEMY_BULLET_SPEED,
              kind: 'straight',
              color,
              size: ENEMY_BULLET_SIZE * 1.3,
              phase: Math.random() * Math.PI * 2,
              life: ENEMY_BULLET_LIFE,
              shipIdx: bc.shipIdx ?? 0,
            });
          }
        }
      }

      // Enemy shots travel toward the player and cost a heart on contact.
      const keptEnemyBullets: EnemyBullet[] = [];
      for (const b of s.enemyBullets) {
        b.life -= dt;
        if (b.kind === 'homing') {
          const dx = s.avatarX - b.x;
          const dy = s.avatarY + AVATAR_SIZE / 2 - b.y;
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
          } else {
            // Close in: dislock and fly straight — now you can dodge it.
            b.kind = 'straight';
          }
          b.x += b.vx * dt;
          b.y += b.vy * dt;
        } else if (b.kind === 'zigzag') {
          // Forward velocity plus a smooth perpendicular sway.
          const spd = Math.hypot(b.vx, b.vy) || 1;
          const perpX = -b.vy / spd;
          const perpY = b.vx / spd;
          const lateral = Math.cos((s.elapsed + b.phase) * ZIG_FREQ) * ZIG_AMP;
          b.x += (b.vx + perpX * lateral) * dt;
          b.y += (b.vy + perpY * lateral) * dt;
        } else {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
        }
        const rad = b.size / 2;
        if (b.x + rad > avLeft && b.x - rad < avRight && b.y + rad > avTop && b.y - rad < avBottom) {
          s.hearts -= 1;
          s.shake = 0.22;
          s.hitFlash = 0.28;
          play('buzz', 0.7);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          burst(b.x, b.y, b.color, 8);
          float(s.avatarX, s.avatarY - 40, '-1 💔', PALETTE.rage);
          continue; // consumed
        }
        if (b.life > 0 && b.y < SCREEN.H + 30 && b.x > -40 && b.x < SCREEN.W + 40) {
          keptEnemyBullets.push(b);
        }
      }
      s.enemyBullets = keptEnemyBullets;

      // Bullets fly up and chip away at hazards (pickups are immune — you
      // can't shoot down your own hearts, coins or gun drops)
      const damage = (c: Card, dmg: number, hx: number, hy: number) => {
        c.hp -= dmg;
        c.hitT = 0.12;
        if (c.hp <= 0) {
          c.dead = true;
          c.deadT = 0;
          playPop(3);
          if (c.boss) {
            s.shake = Math.max(s.shake, 0.35);
            burst(cardX(c), c.y + c.h / 2, PALETTE.rage, 30);
            burst(cardX(c), c.y + c.h / 2, PALETTE.bell, 20);
            dropCoins(
              s,
              cardX(c),
              c.y + c.h / 2,
              c.boss === 'giant' ? BOSS_GIANT_COINS : BOSS_MINI_COINS
            );
          } else {
            burst(cardX(c), c.y + c.h / 2, PALETTE.rage, 12);
          }
        } else {
          burst(hx, hy, PALETTE.bell, 3); // spark on a surviving enemy
        }
      };

      // A bomb's direct hit also detonates: nearby enemy ships take splash
      // damage (half the direct hit).
      const explode = (hit: Card, hx: number, hy: number) => {
        s.shake = Math.max(s.shake, 0.14);
        burst(hx, hy, PALETTE.ad, 18);
        for (const o of s.cards) {
          if (o === hit || !isHazard(o)) continue;
          const ox = cardX(o);
          const oy = o.y + o.h / 2;
          if (Math.hypot(ox - hx, oy - hy) <= BOMB_SPLASH_RADIUS) {
            damage(o, BOMB_SPLASH_DMG, ox, oy);
          }
        }
      };

      const keptBullets: Bullet[] = [];
      for (const b of s.bullets) {
        if (b.kind === 'rocket') {
          // Homing: steer toward the locked enemy while zigzagging.
          let t = s.cards.find((c) => c.id === b.targetId && isHazard(c));
          if (!t) {
            // Its target died: re-lock onto something no other rocket has
            // claimed, so a volley doesn't collapse onto one enemy as the
            // formation thins out. Fall back to the nearest if all are taken.
            const claimed = claimedTargets(s.bullets, b);
            t = nearestHazard(s.cards, b.y, claimed) ?? nearestHazard(s.cards, b.y);
            b.targetId = t?.id;
          }
          const preX = b.x;
          if (t) b.x += (cardX(t) - b.x) * Math.min(8 * dt, 1);
          b.x += Math.sin(s.elapsed * 16 + (b.phase ?? 0)) * 140 * dt;
          b.y -= ROCKET_SPEED * dt;
          // Face where it's actually heading (mostly up, leaning toward its
          // target), so the bolt sprite points along travel instead of sideways.
          b.angle = (Math.atan2(-ROCKET_SPEED * dt, b.x - preX) * 180) / Math.PI;
        } else if (b.kind === 'laser') {
          b.y -= BULLET_SPEED * 1.6 * dt;
        } else {
          b.y -= BULLET_SPEED * dt;
        }
        let alive = b.y > -(LASER_LEN + 30);
        if (alive) {
          for (const c of s.cards) {
            if (!isHazard(c)) continue;
            if (b.kind === 'laser' && b.hits!.includes(c.id)) continue;
            const hw = (c.w ?? OB_HIT) / 2;
            const cx = cardX(c);
            const inX = b.x > cx - hw - 4 && b.x < cx + hw + 4;
            // Lasers are a beam (tip at y, tail below); others are a point.
            const inY =
              b.kind === 'laser'
                ? b.y < c.y + c.h && b.y + LASER_LEN > c.y
                : b.y > c.y && b.y < c.y + c.h;
            if (inX && inY) {
              damage(c, b.dmg, b.x, b.y);
              if (b.kind === 'bomb') explode(c, b.x, b.y);
              if (b.kind === 'laser') {
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

      // Auto-fire from the rocket's nose. This runs AFTER the bullet
      // movement pass on purpose: a new shot gets rendered once at its spawn
      // point before it starts flying — otherwise on a slow frame (dt up to
      // 0.05s) it first appears a full frame-step above the ship. Shots spawn
      // deep under the hull (the ship draws on top of bullets), so they
      // visibly emerge from the nose.
      s.fireTimer -= dt;
      if (s.fireTimer <= 0) {
        s.fireTimer =
          s.gun === 'bomb'
            ? BOMB_FIRE_RATE
            : s.gun === 'laser'
              ? LASER_FIRE_RATE
              : s.gun === 'homing'
                ? ROCKET_FIRE_RATE
                : FIRE_RATE;
        const by = s.avatarY + 18; // under the hull's center
        // A stacked homing gun spreads its volley across separate enemies:
        // shot i takes the i-th nearest hazard, wrapping only if the volley
        // outnumbers what's on screen.
        const volleyTargets = s.gun === 'homing' ? hazardsByProximity(s.cards, s.avatarY) : [];
        const fireOne = (ox: number, shotIdx: number) => {
          if (s.gun === 'bomb') {
            s.bullets.push({ id: s.nextId++, x: ox, y: by, dmg: BOMB_DMG, kind: 'bomb' });
          } else if (s.gun === 'laser') {
            // The beam draws downward from its tip, so start the tip higher —
            // this keeps the whole beam tucked under the ship at spawn.
            s.bullets.push({
              id: s.nextId++,
              x: ox,
              y: s.avatarY - 12,
              dmg: LASER_DMG,
              kind: 'laser',
              hits: [],
            });
          } else if (s.gun === 'homing') {
            s.bullets.push({
              id: s.nextId++,
              x: ox,
              y: by,
              dmg: ROCKET_DMG,
              kind: 'rocket',
              phase: Math.random() * Math.PI * 2,
              targetId: volleyTargets.length
                ? volleyTargets[shotIdx % volleyTargets.length].id
                : undefined,
            });
          } else {
            s.bullets.push({ id: s.nextId++, x: ox, y: by, dmg: BULLET_DMG, kind: 'normal' });
          }
        };
        // Stacking the same gun multiplies parallel shots (double already fires 2).
        const shots = (s.gun === 'double' ? 2 : 1) * s.gunLevel;
        const spacing = 18;
        const spread = (shots - 1) * spacing;
        for (let i = 0; i < shots; i++) {
          fireOne(s.avatarX - spread / 2 + i * spacing, i);
        }
      }

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
      s.hitFlash = Math.max(0, s.hitFlash - dt);

      if (s.hearts <= 0) {
        // Out of hearts — the rocket goes down.
        overRef.current = true;
        play('gameover', 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        onGameOver({
          coins: s.coins,
          altitude: Math.round(s.alt),
        });
      }
    };

    if (!pausedRef.current) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = g.current;
  const shakeX = s.shake > 0 ? (Math.random() - 0.5) * 14 * (s.shake / 0.28) : 0;
  const shakeY = s.shake > 0 ? (Math.random() - 0.5) * 14 * (s.shake / 0.28) : 0;
  const tilt = s.dragging
    ? Math.max(-12, Math.min(12, (s.targetX - s.avatarX) * 0.12))
    : 0;
  const flame = 1 + 0.25 * Math.sin(s.elapsed * 30);

  // Player normal-shot art (avatar-specific). Source sprites point +x, so the
  // bolt is laid out horizontally (length × thickness) and rotated -90° to fly
  // up; the layout box is centered on the bullet so rotation keeps it centered.
  const shotLen = PLAYER_SHOT_LEN;
  const shotThick = PLAYER_SHOT_LEN / avatarShot.aspect;

  return (
    <View style={[styles.wrap, { backgroundColor: SPACE_BLACK }]} {...pan.panHandlers}>
      <View style={[styles.shakeLayer, { transform: [{ translateX: shakeX }, { translateY: shakeY }] }]}>
        {/* One fixed environment for the whole run — the player's chosen background. */}
        {renderBgSet(background, s.alt, 1, 'bg_')}
        {/* Dark scrim so gameplay reads clearly over the bright nebulae. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: SCREEN.W,
            height: SCREEN.H,
            backgroundColor: '#000000',
            opacity: BG_DIM,
          }}
        />
        {/* Hidden pre-warm: mount every projectile sprite once at its in-game
            size so the native image cache is hot before the first shot —
            a cold Image view can take frames to fetch/decode its source,
            which made fast bullets invisible near the ship. */}
        <View pointerEvents="none" style={styles.prewarm}>
          <Image source={avatarShot.src} fadeDuration={0} style={{ width: shotLen, height: shotThick }} />
          <Image source={SHOT_HOMING_IMG} fadeDuration={0} style={{ width: SHOT_HOMING_LEN, height: SHOT_HOMING_THICK }} />
          <Image source={SHOT_BOMB_IMG} fadeDuration={0} style={{ width: SHOT_BOMB_W, height: SHOT_BOMB_H }} />
          <Image source={SHOT_LASER_IMG} fadeDuration={0} style={{ width: SHOT_LASER_LEN, height: SHOT_LASER_THICK }} />
          {ENEMY_SHOTS.map((src, i) => (
            <Image
              key={i}
              source={src}
              fadeDuration={0}
              style={{
                width: ENEMY_BULLET_SIZE * ENEMY_BULLET_ART_SCALE,
                height: (ENEMY_BULLET_SIZE * ENEMY_BULLET_ART_SCALE) / ENEMY_SHOT_ASPECT[i],
              }}
            />
          ))}
        </View>
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
            // Source art streaks sideways; rotate it so it flies nose-up.
            <Image
              key={i}
              source={SHOT_BOMB_IMG}
              resizeMode="contain"
              fadeDuration={0}
              style={{
                position: 'absolute',
                left: b.x - SHOT_BOMB_W / 2,
                top: b.y - SHOT_BOMB_H / 2,
                width: SHOT_BOMB_W,
                height: SHOT_BOMB_H,
                transform: [{ rotate: '180deg' }],
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
                left: b.x - SHOT_LASER_LEN / 2,
                top: b.y + SHOT_LASER_LEN / 2 - SHOT_LASER_THICK / 2,
                width: SHOT_LASER_LEN,
                height: SHOT_LASER_THICK,
                transform: [{ rotate: '-90deg' }],
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
                left: b.x - SHOT_HOMING_LEN / 2,
                top: b.y - SHOT_HOMING_THICK / 2,
                width: SHOT_HOMING_LEN,
                height: SHOT_HOMING_THICK,
                transform: [{ rotate: `${b.angle ?? -90}deg` }],
              }}
            />
          ) : (
            // Normal shot: the avatar's signature bolt. Laid out horizontally
            // (source points +x) and rotated -90° so its head leads upward.
            <Image
              key={i}
              source={avatarShot.src}
              resizeMode="contain"
              fadeDuration={0}
              style={{
                position: 'absolute',
                left: b.x - shotLen / 2,
                top: b.y - shotThick / 2,
                width: shotLen,
                height: shotThick,
                transform: [{ rotate: '-90deg' }],
              }}
            />
          )
        )}
        {s.enemyBullets.map((b, i) => {
          const artIdx = enemyShotForShip(b.shipIdx ?? 0);
          if (artIdx < 0) {
            return (
              <View
                key={i}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: b.x - b.size / 2,
                  top: b.y - b.size / 2,
                  width: b.size,
                  height: b.size,
                  borderRadius: b.size / 2,
                  backgroundColor: b.color,
                  borderWidth: 1.5,
                  borderColor: 'rgba(255,255,255,0.7)',
                }}
              />
            );
          }
          // Sprite bullets: sized off the same base as the plain dot, drawn at
          // the source art's aspect, rotated to face its direction of travel.
          // Missiles point UP in the source, so map their nose (0,-1) onto the
          // velocity: rotate by atan2(vx, -vy) — e.g. straight down → 180°.
          const bw = b.size * ENEMY_BULLET_ART_SCALE;
          const bh = bw / ENEMY_SHOT_ASPECT[artIdx];
          const angle = (Math.atan2(b.vx, -b.vy) * 180) / Math.PI;
          return (
            <Image
              key={i}
              source={ENEMY_SHOTS[artIdx]}
              resizeMode="contain"
              fadeDuration={0}
              style={{
                position: 'absolute',
                left: b.x - bw / 2,
                top: b.y - bh / 2,
                width: bw,
                height: bh,
                transform: [{ rotate: `${angle}deg` }],
              }}
            />
          );
        })}
        {s.cards.map((c) => (
          <ObstacleView key={c.id} ob={c} avatarShot={avatarShot} />
        ))}
        {/* The vehicle: an image avatar (e.g. jet) flies as-is; otherwise the
            emoji rides a little rocket with a nose cone and flickering flame. */}
        <View
          style={[
            styles.rocket,
            {
              left: s.avatarX - 36,
              top: s.avatarY - 22,
              transform: [{ rotate: `${tilt}deg` }, { scale: 1.45 }],
            },
          ]}
          pointerEvents="none"
        >
          {avatarImage ? (
            <Image source={avatarImage} style={styles.jetImg} resizeMode="contain" fadeDuration={0} />
          ) : (
            <>
              <View style={styles.nose} />
              <View style={styles.avatar}>
                <Text style={styles.avatarEmoji}>{avatarEmoji}</Text>
              </View>
              <Text style={[styles.flame, { transform: [{ scaleY: -flame }, { scaleX: flame }] }]}>
                🔥
              </Text>
            </>
          )}
        </View>
        {s.particles.map((p) => (
          <ParticleView key={p.id} p={p} />
        ))}
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
      <HUD
        coins={s.coins}
        alt={s.alt}
        gun={s.gun}
        gunTime={s.gunTime}
        gunLevel={s.gunLevel}
      />
      <HealthBar hearts={s.hearts} />
      {!paused && (
        <Pressable onPress={doPause} hitSlop={12} style={styles.pauseBtn}>
          <Text style={styles.pauseIcon}>❚❚</Text>
        </Pressable>
      )}
      {paused && (
        <View style={styles.pauseOverlay}>
          <Text style={styles.pauseTitle}>PAUSED</Text>
          <Text style={styles.pauseDist}>🚀 {Math.round(s.alt)}m</Text>
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
      s.cards.push(makeEnemy(s, startLane + k, FORMATION_TOP + row * FORMATION_ROW_GAP, wave, row));
      placed++;
    }
    row++;
  }
}

function makeEnemy(s: GameState, lane: number, holdY: number, wave: number, row: number): Card {
  const hp = 2 + Math.floor(wave * 0.6); // tougher every wave
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
    shipIdx: shipForWave(wave),
    dead: false,
    deadT: 0,
    nearMissChecked: false,
  };
}

// A boss payout: coins fanned out around the kill point, each falling from
// there so they still have to be flown through. Positions are clamped to the
// play area so an edge-swaying boss can't drop coins out of reach.
function dropCoins(s: GameState, x: number, y: number, count: number): void {
  const spread = (count - 1) * COIN_DROP_SPACING;
  const minX = FEED_PAD + COIN_VIS / 2;
  const maxX = SCREEN.W - FEED_PAD - COIN_VIS / 2;
  for (let i = 0; i < count; i++) {
    const coin = makeCard(s, 0, 'coin'); // lane is unused once cx is set
    coin.cx = Math.max(minX, Math.min(maxX, x - spread / 2 + i * COIN_DROP_SPACING));
    coin.y = y + (Math.random() - 0.5) * 24; // stagger so they don't fall as one line
    s.cards.push(coin);
  }
}

function makeCard(s: GameState, lane: number, kind: 'heart' | 'gift' | 'coin'): Card {
  // Pickups (heart / coin / gun) that fall down toward the player. A gun drop
  // rolls which gun it grants here, at spawn, so it can fall wearing that
  // gun's art — you read what's coming before deciding whether to go for it.
  const gun = kind === 'gift' ? GIFT_GUNS[Math.floor(Math.random() * GIFT_GUNS.length)] : undefined;
  return {
    id: s.nextId++,
    kind,
    lane,
    y: -OB_VIS - 10,
    h: OB_HIT,
    emoji: gun ? GUN_PICKUP_EMOJI[gun] : kind === 'heart' ? '❤️' : '',
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
  rocket: {
    position: 'absolute',
    width: 72,
    alignItems: 'center',
  },
  nose: {
    width: 0,
    height: 0,
    borderLeftWidth: 17,
    borderRightWidth: 17,
    borderBottomWidth: 22,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FF5A5F',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#1D222A',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 30,
  },
  jetImg: {
    width: AVATAR_IMG_W,
    height: AVATAR_IMG_H,
    marginTop: 2,
  },
  flame: {
    fontSize: 22,
    marginTop: -2,
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
    backgroundColor: PALETTE.rage,
  },
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
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
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
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 6,
  },
  pauseDist: {
    color: PALETTE.textDim,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 6,
    marginBottom: 34,
  },
  pausePrimary: {
    backgroundColor: PALETTE.moment,
    paddingVertical: 16,
    borderRadius: 14,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginBottom: 12,
  },
  pausePrimaryTxt: {
    color: '#0B0D10',
    fontSize: 16,
    fontWeight: '900',
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
    color: PALETTE.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
  },
  pausePressed: { opacity: 0.7 },
});
