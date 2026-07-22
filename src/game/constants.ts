import { Dimensions } from 'react-native';
import { GunKind } from './types';

const { width: W, height: H } = Dimensions.get('window');
export const SCREEN = { W, H };

// --- Sky columns: more lanes = obstacles spread across many narrow columns ---
export const LANES = 5;
export const FEED_PAD = 8;
export const LANE_W = (W - FEED_PAD * 2) / LANES;
export const laneX = (lane: number) => FEED_PAD + lane * LANE_W + LANE_W / 2;

// --- Player avatar (rocket) ---
// You're climbing: the world falls from the top, so the rocket flies in the
// lower third to give reaction time.
export const AVATAR_SIZE = 56;
export const AVATAR_Y = H - Math.round(H * 0.28);

// --- The ascent (endless — the run starts already out in deep space) ---
export const RAMP_ALT = 20000; // m: difficulty and speed max out by here
export const ALT_RATE_MIN = 120; // m/s at liftoff (climb faster → full burn sooner)
export const ALT_RATE_MAX = 300; // m/s at full burn

// --- Obstacles (small, compact shapes; visuals slightly larger than hitboxes) ---
export const OB_EMOJI = 34; // font size for 😡 / ⛽
export const OB_VIS = 50; // visual footprint (glow ring) of emoji obstacles
export const OB_HIT = 36; // collision box — forgiving: smaller than the visual

// --- Difficulty curve ---
// Slower approach, tankier enemies: the fight is about firepower, not reflexes.
export const BASE_SPEED = 170; // px/s
export const MAX_SPEED = 420;
export const RAMP_SECONDS = 90;
export const BASE_ROW_INTERVAL = 1.0; // seconds between spawn rows
export const MIN_ROW_INTERVAL = 0.5;

// --- Pickups (hearts / coins / gun drops) drift down slower than the world
// falls, so they linger long enough to line up and grab. Fraction of the
// current world speed. ---
export const PICKUP_FALL_SCALE = 0.55;

// --- Hearts (your health): every hit costs one, ❤️ pickups restore one ---
export const HEARTS_START = 3;
export const HEARTS_MAX = 10;
export const HEART_EVERY = 16; // s between ❤️ drops

// --- Guns & bullets ---
export const FIRE_RATE = 0.32; // s between shots (single / double)
export const BOMB_FIRE_RATE = 0.6; // bombs hit harder but fire slower
export const BULLET_SPEED = 720; // px/s upward
export const BULLET_DMG = 1;
export const BOMB_DMG = 6; // direct hit
export const BOMB_SPLASH_DMG = 3; // explosion damage to nearby enemies (half of direct)
export const BOMB_SPLASH_RADIUS = 95; // px from the impact point
export const LASER_FIRE_RATE = 0.5;
export const LASER_DMG = 4;
export const LASER_LEN = 60; // beam length px — pierces everything it sweeps
export const ROCKET_FIRE_RATE = 0.7; // s between homing rocket launches
export const ROCKET_DMG = 6;
export const ROCKET_SPEED = 430; // slower than bullets, but it never misses
export const GUN_TIME = 16; // s a gift gun lasts before reverting to single
export const GIFT_EVERY = 9; // s between gun drops
// Re-collecting the same gun doubles its parallel shots: 1 → 2 → 4. A fourth
// pickup refreshes the timer but holds at 4, so late runs don't turn into an
// unaimable wall of bullets.
export const MAX_GUN_LEVEL = 4;

// --- Waves (Galaxy-Attack style: clear a formation, next wave drops in harder) ---
export const FORMATION_TOP = 150; // y of the top formation row (below the HUD)
export const FORMATION_ROW_GAP = 66; // vertical gap between formation rows
export const ENEMY_DESCEND_SPEED = 150; // px/s enemies drop in to their hold slot
export const WAVE_GAP = 1.1; // seconds between clearing a wave and the next
export const WAVE_BASE_ENEMIES = 3; // enemies in wave 1
export const WAVE_MAX_ENEMIES = 12; // cap so the screen never fully fills

// --- Enemy return fire (scales up every wave) ---
export const ENEMY_FIRE_EVERY = 2.3; // base seconds between enemy shots (gentler ramp)
export const ENEMY_BULLET_SPEED = 210; // px/s, aimed at the player (slow enough to dodge)

// --- Wave-escalating enemy fire ---
export const ZIGZAG_WAVE = 5; // shots weave in a smooth zigzag from here
export const HOMING_WAVE = 15; // enemies fire slow locking rockets from here
export const CHARGE_WAVE = 20; // wounded enemies charge the player from here
export const ENEMY_BULLET_SIZE = 11; // base diameter
export const ZIG_AMP = 95; // px/s lateral sway of a zigzag shot
export const ZIG_FREQ = 7; // rad/s zigzag frequency (smooth)
export const ENEMY_HOMING_SPEED = 165; // slower than the player → dodgeable at the last moment
export const ENEMY_HOMING_TURN = 1.6; // rad/s turn rate
export const ENEMY_HOMING_DISLOCK = 120; // px: within this range the rocket stops tracking and flies straight (comes closer)
export const ENEMY_BULLET_LIFE = 6; // s before a shot fizzles
export const ENEMY_HOMING_LIFE = 4.5; // s (bounds a missed homing rocket)
export const CHARGE_SPEED = 120; // px/s wounded-enemy charge (not too fast)
// Distinct bullet color per wave (cycles).
export const WAVE_COLORS = ['#FF3B3B', '#FF9F1C', '#FFE94D', '#3DDC84', '#3D9BFF', '#B06BFF', '#FF6BD6', '#00E5D0'];

// --- Enemy art (2D Space Shooter pack): a new alien design every SHIP_WAVES waves ---
export const SHIP_WAVES = 5; // waves each design lasts
export const ENEMY_SHIPS = [
  require('../../assets/obstacles/enemy1.png'), // waves 1–5: red demon
  require('../../assets/obstacles/enemy2.png'), // waves 6–10: green squid
  require('../../assets/obstacles/enemy3.png'), // waves 11–15: beetle
  require('../../assets/obstacles/enemy4.png'), // waves 16–20: teal octopus
  require('../../assets/obstacles/enemy5.png'), // waves 21–25: demon recolor
  require('../../assets/obstacles/enemy6.png'), // waves 26+: octopus recolor
];
export const shipForWave = (wave: number) =>
  Math.max(0, Math.min(Math.floor((wave - 1) / SHIP_WAVES), ENEMY_SHIPS.length - 1));

// --- Bosses: a mini boss holds every 5th wave, a giant every 10th ---
export const BOSS_MINI_IMG = require('../../assets/obstacles/boss_mini.png');
export const BOSS_GIANT_IMG = require('../../assets/obstacles/boss_giant.png');
export const BOSS_MINI_VIS = 104; // rendered size (px)
export const BOSS_MINI_HIT = 82; // hitbox (forgiving, smaller than the visual)
export const BOSS_GIANT_VIS = 168;
export const BOSS_GIANT_HIT = 132;
export const BOSS_MINI_HP = (wave: number) => 22 + wave * 2;
export const BOSS_GIANT_HP = (wave: number) => 50 + wave * 3;
export const BOSS_SWAY_AMP = 0.3; // fraction of screen width the boss sways from center
export const BOSS_SWAY_FREQ = 0.7; // rad/s

// --- Gun power-up projectiles (from the laser/bullet FX pack). Each falling
// pickup wears its gun's own shot art so you can read what it grants before
// grabbing it. The 'double' pickup instead shows the avatar's own shot doubled
// (resolved in the render, since it depends on the equipped ship). ---
export const SHOT_BOMB_IMG = require('../../assets/bullets/gun_bomb.png'); // yellow blast cloud
export const SHOT_LASER_IMG = require('../../assets/bullets/gun_laser.png'); // red energy beam
export const SHOT_HOMING_IMG = require('../../assets/bullets/gun_rocket.png'); // green rocket bolt

// --- Sprite render sizes ---
// Shared by the live render and the boot preloader: an image warmed at a
// different size than it's drawn at can decode a second bitmap on first use,
// which is exactly the late-paint this preloading exists to prevent.
export const ENEMY_SHIP_VIS = 56;
export const AVATAR_IMG_W = 56;
export const AVATAR_IMG_H = 64;
// The power-up shots are drawn the same length as the default bolt
// (PLAYER_SHOT_LEN = 62), each at its own source aspect.
// Bomb: a soft blast cloud. The source art streaks horizontally, so the render
// rotates it 90° to point along travel (up). Source aspect ~1.26.
export const SHOT_BOMB_W = 72;
export const SHOT_BOMB_H = 57;
// Laser: a piercing beam-bolt, laid out along travel then rotated to point up.
// Drawn longer than the beam's mechanical reach (LASER_LEN); the extra is
// trailing tail behind the tip, which is what lands the hit. Source aspect ~1.74.
export const SHOT_LASER_LEN = 62;
export const SHOT_LASER_THICK = 36;
// Homing rocket: a bolt rotated to face its heading. Source aspect ~2.31.
export const SHOT_HOMING_LEN = 44; // along travel
export const SHOT_HOMING_THICK = 19;
export const ENEMY_BULLET_ART_SCALE = 3.2; // sprite width = bullet size × this (missiles have canvas padding, so drawn a bit larger)

// --- Enemy bullet art: every ship tier fires its own missile sprite (from the
// "2D Space Shooter" pack) instead of a plain colored dot. Each is a distinct
// design/color so the tiers read apart. There are 6 ship tiers and 5 shots, so
// they cycle (shipIdx % 5): the 6th tier reuses the first. The sprites point UP
// (nose at top) on a square canvas — the render rotates them to face travel.
export const ENEMY_SHOTS = [
  require('../../assets/bullets/eshot1.png'), // alien1 (waves 1–5) / alien6 (26+): green missile
  require('../../assets/bullets/eshot2.png'), // alien2, waves 6–10: teal missile
  require('../../assets/bullets/eshot3.png'), // alien3, waves 11–15: red missile
  require('../../assets/bullets/eshot4.png'), // alien4, waves 16–20: blue missile
  require('../../assets/bullets/eshot5.png'), // alien5, waves 21–25: pink missile
];
// Square canvases (art centered with padding) — drawn at 1:1.
export const ENEMY_SHOT_ASPECT = [1, 1, 1, 1, 1];
export const enemyShotForShip = (shipIdx: number) =>
  ENEMY_SHOTS.length ? ((shipIdx % ENEMY_SHOTS.length) + ENEMY_SHOTS.length) % ENEMY_SHOTS.length : -1;

// --- Parallax space backgrounds. Two source packs, one render model:
// each set is an optional static base composite plus scrolling layers
// (far slowest → near fastest). The game cycles through the sets as you
// climb, crossfading between them.
//
// • "Space Parallax Backgrounds v1" sets (bg0–bg3): 720×1280 portrait,
//   base + 3 opaque layers composited at 0.4 alpha (per the pack's config),
//   NOT tileable → mirror-tiled (odd copies flipped) to hide the seam.
// • "SBS Seamless Space Backgrounds" sets: square 512 tiles, genuinely
//   seamless → tiled plainly. No static base; the nebula tile itself is the
//   slowest opaque layer, with two shared starfield tiles above it.
interface BgLayer {
  src: number;
  speed: number;
  alpha: number;
}
export interface BgSet {
  base?: number; // static full-screen composite behind the layers
  aspect: number; // displayed tile height = screen width × this
  mirror: boolean; // mirror-tile non-seamless art; seamless tiles repeat plainly
  layers: BgLayer[];
}

const SPBG_ASPECT = 1280 / 720;
const spbgSet = (base: number, far: number, mid: number, near: number): BgSet => ({
  base,
  aspect: SPBG_ASPECT,
  mirror: true,
  layers: [
    { src: far, speed: 0.2, alpha: 0.4 },
    { src: mid, speed: 0.5, alpha: 0.4 },
    { src: near, speed: 1.0, alpha: 0.4 },
  ],
});

// Shared SBS starfield tiles (opaque black — partial alpha lets the nebula
// underneath show through while the stars stay visible).
const SBS_STARS_MID = require('../../assets/background/sbs_stars_mid.png');
const SBS_STARS_NEAR = require('../../assets/background/sbs_stars_near.png');
const SBS_PURPLE = require('../../assets/background/sbs_purple.png');
const SBS_BLUE = require('../../assets/background/sbs_blue.png');
const SBS_GREEN = require('../../assets/background/sbs_green.png');
const sbsSet = (nebula: number): BgSet => ({
  aspect: 1,
  mirror: false,
  layers: [
    { src: nebula, speed: 0.15, alpha: 1 },
    { src: SBS_STARS_MID, speed: 0.5, alpha: 0.5 },
    { src: SBS_STARS_NEAR, speed: 1.0, alpha: 0.65 },
  ],
});

// --- Backgrounds: one environment is shown for the whole run; the player
// picks (and buys) which one, exactly like avatars. `set` is the parallax
// render config; `preview` is a single representative still for the shop. ---
export interface BackgroundDef {
  id: string;
  name: string;
  price: number; // in coins
  preview: number; // require()'d still shown in the shop
  set: BgSet;
}

export const BACKGROUNDS: BackgroundDef[] = [
  // Dark purple/rose haze — the free starter (was the opening view). Unlike the
  // other SBS sets, the nebula is drawn IN FRONT of the starfields (at partial
  // alpha so the stars still shine through) — a slow fog drifting over stars.
  {
    id: 'violet',
    name: 'Violet Veil',
    price: 0,
    preview: SBS_PURPLE,
    set: {
      aspect: 1,
      mirror: false,
      layers: [
        { src: SBS_STARS_MID, speed: 0.5, alpha: 1 },
        { src: SBS_STARS_NEAR, speed: 1.0, alpha: 0.65 },
        { src: SBS_PURPLE, speed: 0.15, alpha: 0.6 },
      ],
    },
  },
  {
    id: 'azure',
    name: 'Azure Drift', // teal/blue wisps
    price: 120,
    preview: SBS_BLUE,
    set: sbsSet(SBS_BLUE),
  },
  {
    id: 'void',
    name: 'Deep Void', // void_02 — near-black quiet starfield
    price: 90,
    preview: require('../../assets/background/bg1_base.jpg'),
    set: spbgSet(
      require('../../assets/background/bg1_base.jpg'),
      require('../../assets/background/bg1_far.jpg'),
      require('../../assets/background/bg1_mid.jpg'),
      require('../../assets/background/bg1_near.jpg')
    ),
  },
  {
    id: 'ember',
    name: 'Ember Reach', // stellar_03 — orange wisps on blue-grey
    price: 240,
    preview: require('../../assets/background/bg2_base.jpg'),
    set: spbgSet(
      require('../../assets/background/bg2_base.jpg'),
      require('../../assets/background/bg2_far.jpg'),
      require('../../assets/background/bg2_mid.jpg'),
      require('../../assets/background/bg2_near.jpg')
    ),
  },
  {
    id: 'crimson',
    name: 'Crimson Cloud', // stellar_01 — red/rust nebula (the showpiece)
    price: 450,
    preview: require('../../assets/background/bg0_base.jpg'),
    set: spbgSet(
      require('../../assets/background/bg0_base.jpg'),
      require('../../assets/background/bg0_far.jpg'),
      require('../../assets/background/bg0_mid.jpg'),
      require('../../assets/background/bg0_near.jpg')
    ),
  },
  {
    id: 'verdant',
    name: 'Verdant Aurora', // vivid green aurora
    price: 300,
    preview: SBS_GREEN,
    set: sbsSet(SBS_GREEN),
  },
  {
    id: 'quartz',
    name: 'Rose Quartz', // stellar_05 — dusty pink/blue clouds
    price: 180,
    preview: require('../../assets/background/bg3_base.jpg'),
    set: spbgSet(
      require('../../assets/background/bg3_base.jpg'),
      require('../../assets/background/bg3_far.jpg'),
      require('../../assets/background/bg3_mid.jpg'),
      require('../../assets/background/bg3_near.jpg')
    ),
  },
];

// Every background's parallax set — still consumed by the boot preloader.
export const BG_SETS: BgSet[] = BACKGROUNDS.map((b) => b.set);
export const BG_PX_PER_M = 0.4; // near-layer scroll px per meter climbed
export const BG_DIM = 0.42; // dark scrim over the background so gameplay pops

// --- Boot preload ---
// Assets are fetched over HTTP from the Metro dev server in development and
// read from the bundle in release; either way the first use of an image pays
// for it. The boot gate pays that cost up front behind a loading screen.
export const PRELOAD_TIMEOUT_MS = 12000; // safety net — a stalled fetch must never brick boot
export const PRELOAD_BATCH = 4; // assets fetched in parallel (gentle on low-end devices)
// Downloading only puts a file on disk. The bitmap cache is per-process, so a
// warm second launch still has to decode — and that pass resolves instantly,
// which would drop the gate before a single sprite had painted. Boot therefore
// also waits on the sprites' own onLoad, with a grace window in case those
// never land (a broken asset, or a test renderer with no native image stack).
export const DECODE_GRACE_MS = 900;
// A fully warm boot would otherwise flash the loading screen for a frame or
// two, which reads as a glitch. Set to 0 to show it only when it's earned.
export const MIN_LOADING_MS = 350;

export const GUN_LABEL: Record<string, string> = {
  double: '🔫 DOUBLE FIRE',
  bomb: '💣 BOMBS',
  laser: '🔴 LASER',
  homing: '🚀 HOMING',
};

// What a gun drop looks like while it's still falling. A pickup shows the gun's
// own projectile art, so you can read what it gives before committing to the
// grab. 'double' is absent here — it renders two of the avatar's own shots
// (see ObstacleView), since that art depends on the equipped ship.
export const GUN_PICKUP_IMG: Partial<Record<GunKind, number>> = {
  bomb: SHOT_BOMB_IMG,
  laser: SHOT_LASER_IMG,
  homing: SHOT_HOMING_IMG,
};
export const GUN_PICKUP_EMOJI: Record<GunKind, string> = {
  single: '🔫',
  double: '🔫',
  bomb: '💣',
  laser: '🔴',
  homing: '🚀',
};
export const GIFT_ICON = 48; // rendered size of a gun-drop sprite (large so you can read the gun before grabbing)
export const GIFT_SHOT_LEN = 40; // length of each shot in the doubled 'double' pickup icon

// --- Coins: the only currency. Collected in flight, spent on ships. ---
export const COIN_EVERY = 6; // s between coin drops
// Rendered diameter of a falling coin. Well under the OB_HIT collision box, so
// it stays generous to grab while reading as a small pickup rather than a
// hazard-sized object.
export const COIN_VIS = 20;
// A killed boss bursts into coins you still have to fly through and collect.
export const BOSS_MINI_COINS = 6;
export const BOSS_GIANT_COINS = 14;
export const COIN_DROP_SPACING = 26; // px between coins in a payout fan
export const COIN_GOLD = '#FFC93C'; // face
export const COIN_GOLD_EDGE = '#C98A16'; // rim
export const COIN_GOLD_SHINE = '#FFE9A8'; // inner highlight

export const PALETTE = {
  bg: '#0B0D10',
  card: '#171A20',
  cardBorder: '#232830',
  rage: '#FF4757',
  rageDim: '#3A1418',
  moment: '#2ED573',
  momentDim: '#12301E',
  ad: '#FFA502',
  adDim: '#33250A',
  bell: '#FFD32A',
  text: '#E8EAED',
  textDim: '#8B929D',
};

// --- Player fire-shot art. Each avatar has its own signature bolt (the normal
// gun's projectile); pricier ships get flashier ones. Source sprites are
// horizontal (point +x) and the renderer rotates them to face travel. `aspect`
// is the source width/height; the shot is drawn PLAYER_SHOT_LEN px along its
// length, with thickness = PLAYER_SHOT_LEN / aspect. ---
export const PLAYER_SHOT_LEN = 62; // px, the bolt's on-screen length

export interface ShotArt {
  src: number;
  aspect: number;
}

// --- Avatars: unlockable with coins ---
export interface AvatarDef {
  id: string;
  emoji: string; // fallback shown when the avatar has no image
  name: string;
  price: number; // in coins
  image?: number; // require()'d local asset (static path, resolved by Metro)
  shot: ShotArt; // the ship's signature fire-shot art
}

// Each ship fires its own signature energy-orb bolt from the FX pack.
export const AVATARS: AvatarDef[] = [
  {
    id: 'ironclad', emoji: '🚀', name: 'Ironclad', price: 0,
    image: require('../../assets/avatars/pship1.png'),
    shot: { src: require('../../assets/bullets/pshot1.png'), aspect: 1.75 },
  },
  {
    id: 'specter', emoji: '🚀', name: 'Specter', price: 60,
    image: require('../../assets/avatars/pship2.png'),
    shot: { src: require('../../assets/bullets/pshot2.png'), aspect: 1.739 },
  },
  {
    id: 'raptor', emoji: '🚀', name: 'Raptor', price: 150,
    image: require('../../assets/avatars/pship3.png'),
    shot: { src: require('../../assets/bullets/pshot3.png'), aspect: 1.75 },
  },
  {
    id: 'nova', emoji: '🚀', name: 'Nova', price: 300,
    image: require('../../assets/avatars/pship4.png'),
    shot: { src: require('../../assets/bullets/pshot4.png'), aspect: 1.739 },
  },
  {
    id: 'valkyrie', emoji: '🚀', name: 'Valkyrie', price: 500,
    image: require('../../assets/avatars/pship5.png'),
    shot: { src: require('../../assets/bullets/pshot5.png'), aspect: 1.647 },
  },
];
