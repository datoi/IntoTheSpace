import { Dimensions } from 'react-native';
// Type-only: constants.ts must stay a runtime LEAF. types.ts pulls in the
// pickup and enemy catalogs, which import from here — a value import in this
// direction would close that loop and leave one of the three modules reading
// half-initialised constants at import time.
import type { IconName } from '../components/Icon';
import type { GunKind, SpecialKind } from './types';
// Type-only: `enemies` imports values from here, so a value import back would
// close the cycle this file's header warns about.
import type { ArchKind } from './enemies';

const { width: W, height: H } = Dimensions.get('window');
export const SCREEN = { W, H };

// --- Colour tokens -----------------------------------------------------------
// Semantic names, not inherited ones. The old palette named colours after the
// feature that first used them (`rage`, `moment`, `bell`), which is why each of
// those ended up doing three unrelated jobs — `rage` was simultaneously damage
// feedback, the title accent, and a *helpful* pickup. Naming by meaning is what
// makes the friend/foe rule below enforceable.
//
// THE RULE: one hue family per allegiance.
//   plasma  = the player. Ship, meter, shields, graze, primary CTA, equipped.
//             NEVER on an enemy, a hazard, or a price.
//   threat  = hostile. Enemy fire, auras, mines, hull damage, health, death.
//             NEVER on a pickup, a reward, a button, or the chain multiplier.
//   gold    = reward. Coins, prices, chain, ribbons, unlocks.
//   violet / amber = the two boon families (control / offensive).
//
// Wave variety comes from sprite and scale, never from re-tinting the thing that
// ends the run.
export const PALETTE = {
  // --- Ground ---
  // Blue-biased black. The bias is the point: a neutral #0B0D10 reads as
  // "dark mode", a blue-black reads as space.
  void: '#05070E', // app background, menu backdrop
  hull: '#0D1320', // every card, row, panel, sheet
  hullHi: '#151D2E', // raised / pressed surface
  edge: '#223049', // every border
  edgeSoft: 'rgba(24,34,53,0.55)', // internal dividers inside a card

  // --- Player / brand ---
  plasma: '#35D6FF',
  plasmaDeep: '#0A84FF', // gradient end, pressed state
  plasmaGlow: 'rgba(53,214,255,0.35)',

  // --- Hostile ---
  threat: '#FF2E5B',
  threatDeep: '#B0113A',
  threatAlt: '#FF4FA8', // third hostile intensity, for elite auras
  threatGlow: 'rgba(255,46,91,0.35)',

  // --- Reward ---
  gold: '#FFC93C', // coins, prices, chain, ribbons, unlocks
  goldHi: '#FFE9A8',

  // --- Boon families ---
  violet: '#A46BFF', // control: freeze, slow motion
  amber: '#FF9F1C', // offensive: damage, fire rate, bombs
  // Health, and the one exception to "no red on a pickup". Deliberately a WARM
  // scarlet, not `threat`'s pink-leaning crimson: health red is a genre
  // convention strong enough to be worth the adjacency, but the two must not be
  // the same value or the friend/foe rule stops meaning anything.
  vital: '#FF3B30',
  energy: '#34E27A', // the special meter — the palette's only green

  // --- Ink ---
  ink: '#EAF1FF', // primary text — cool white, not grey
  inkDim: '#7E90AE', // secondary
  inkMute: '#4C5C78', // tertiary, disabled, hairline labels
} as const;

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

// Hard ceiling on live particles. Every one is its own view, re-rendered each
// frame, and a single event can resolve a dozen kills at once (a Nova sweeping
// a full formation, a bomb chain) — 12 kills × a 12-spark burst would spike the
// frame on a low-end device. Comfortably above what normal play produces.
// Also the size of the particle view POOL: the layer mounts exactly this many
// views once and recycles them, so this number is a fixed cost paid at mount
// rather than a per-frame one. Down from 120 — a Nova clearing a screen used to
// queue more debris than any of it was individually legible at.
export const MAX_PARTICLES = 40;

/**
 * Hard ceiling on live enemy shots.
 *
 * The particle and explosion pools were capped; the projectile arrays were not,
 * and they are the ones that GROW WITH DIFFICULTY. By wave 20 a formation is
 * twelve enemies on independent weapon clocks — scattergun archetypes throw
 * five-shot spreads and death bursts throw ten — on top of the global volley
 * and a boss barrage. Each live
 * shot is a native view plus a fresh style object every frame, so the one pool
 * nothing bounded was also the one that scaled fastest.
 *
 * Deliberately NOT a QUALITY_TIERS entry. The tiers promise that nothing they
 * touch is "anything the player can act on"; an enemy shot very much is, and
 * tier-scaling this would quietly make the game easier on a slow phone and
 * harder on a fast one. A single fixed ceiling keeps every device playing the
 * same game.
 *
 * Enforced by REFUSING TO SPAWN, never by deleting a live shot: dropping the
 * oldest would delete the bullet nearest the player — the one being dodged —
 * and a shot vanishing mid-flight is indistinguishable from a rendering bug.
 * Set well above what ordinary play produces, so it is a bound on the
 * pathological tail rather than a balance lever.
 */
export const MAX_ENEMY_BULLETS = 72;

/**
 * Hard ceiling on live floating score texts.
 *
 * Every float is a <Text>, which is the most expensive primitive in the
 * renderer — it carries a layout and a text measurement that a coloured View
 * does not. This pool was the last uncapped one, and unlike the others it fills
 * from a SINGLE event: a Nova resolving a whole formation pays one float per
 * kill on one frame, so a dozen text nodes could be created in the same frame
 * that is already carrying the shockwave, the whiteout, a forced hit-stop and
 * every death animation. That is why the Nova specifically stuttered.
 *
 * Unlike MAX_ENEMY_BULLETS this recycles the OLDEST rather than refusing the
 * newest, which is the right way round here: floats are pure readout, the old
 * one is already fading, and the number the player most wants is the one that
 * just landed. Ten is past the point where they overlap into an unreadable
 * stack anyway — the cap costs no information that was legible to begin with.
 */
export const MAX_FLOATS = 10;

// --- Enemy death explosions ---------------------------------------------------
// A 10-frame sprite animation per kill, in the colour family of the hull that
// died — the same hue matching the enemy shots use, so a green ship fires green
// and dies green.
//
// This is CHEAPER than the spark burst it mostly replaces, which is the reason
// it can exist at all on a screen that was already struggling: one Image
// swapping its source ten times, against twelve-to-thirty particle views each
// written every frame they live. The sparks stay, at a reduced count, because
// the sprite alone reads as a decal — the debris is what sells the direction.
//
// Sources are the 550–800px pack art downsampled to 192 square. At the ~92px
// they draw at, the originals would have held ~2.5MB of bitmap EACH.
export const EXPLOSION_FRAMES = 10;
export const EXPLOSION_FPS = 22; // ~0.45s per burst
export const EXPLOSION_LIFE = EXPLOSION_FRAMES / EXPLOSION_FPS;
export const EXPLOSION_VIS = 92; // drawn size for an ordinary enemy
export const EXPLOSION_BOSS_SCALE = 2.4;
/**
 * Pool ceiling at full detail. Past this the oldest is recycled rather than a
 * new one added. The live ceiling comes from QUALITY_TIERS, which starts here
 * and steps down on a device that can't hold the frame budget.
 */
export const MAX_EXPLOSIONS = 8;

/**
 * One horizontal sprite sheet per colour family, frames left to right.
 *
 * This was sixty separate PNGs — ten per style — stepped by swapping an
 * <Image>'s `source` ten times across EXPLOSION_LIFE. With MAX_EXPLOSIONS
 * burning at once that is ~180 source changes a second, each one a trip through
 * the native image pipeline even on a cache hit, and it peaked on exactly the
 * frame a formation died. It was the last measurable stutter in the game.
 *
 * With a sheet the source NEVER changes: the image mounts once and the frame is
 * chosen by translating the strip inside a clip, which is a pure transform —
 * no layout, no image pipeline. It also turns sixty preloaded, simultaneously
 * decoded bitmaps into six.
 *
 * Frame N sits at x = N * (sheet width / EXPLOSION_FRAMES). Built by
 * scripts/make-explosion-sheets.mjs, which is the source of truth for the
 * packing — the index into this array is the style stored on a live explosion,
 * SO THE ORDER MUST MATCH THE SCRIPT'S.
 */
export const EXPLOSION_SHEETS: number[] = [
  require('../../assets/effects/exp_crimson.png'), // 0 — red hulls (enemy01 / 03 / 11)
  require('../../assets/effects/exp_green.png'), //   1 — enemy02 / 05 / 06
  require('../../assets/effects/exp_teal.png'), //    2 — enemy07 / 08 / 10
  require('../../assets/effects/exp_aqua.png'), //    3 — enemy09
  require('../../assets/effects/exp_cyan.png'), //    4 — the cool hulls, enemy04 / 12
  // 5 — bosses only: a real fireball, so the big kill does not read as a large
  // version of the small one.
  require('../../assets/effects/exp_fire.png'),
];

export const EXPLOSION_BOSS = 5;

/**
 * Hull sprite index → explosion style, matched on measured hue.
 *
 * enemy01 4° / enemy03 4° / enemy11 359° → crimson
 * enemy02 101° / enemy05 135° / enemy06 130° → green
 * enemy07 155° / enemy08 155° / enemy10 158° → teal
 * enemy09 173° → aqua
 * enemy04 246° / enemy12 206° → cyan (the two cool hulls)
 */
export const EXPLOSION_FOR_SHIP = [0, 1, 0, 4, 1, 1, 2, 2, 3, 2, 0, 4];

export const explosionForShip = (shipIdx: number): number =>
  EXPLOSION_FOR_SHIP[Math.min(Math.max(shipIdx, 0), EXPLOSION_FOR_SHIP.length - 1)];

// --- Effect budget -----------------------------------------------------------
// Explosions yield to the board.
//
// Every live card and bullet is already a view being laid out this frame, so a
// 50-spark boss burst lands its cost exactly when the frame is least able to
// absorb it — which is why the stutter scaled with how much was on screen
// rather than with the kill itself. `burst()` scales its spark count down as
// the board fills: quiet screens get the full effect, busy ones get a third of
// it, and the difference is invisible next to a formation's worth of motion.
export const EFFECT_LOAD_LOW = 24; // at or under this, full-size bursts
export const EFFECT_LOAD_HIGH = 70; // at or over this, bursts are at their floor
export const EFFECT_MIN_SCALE = 0.35; // never drop a burst below a third

/**
 * The most sparks any ONE event may add.
 *
 * Neither throttle above catches the case that actually hurt. `effectScale`
 * reads the board, which a Nova fired at a nearly-empty screen passes with full
 * marks; the frame-time governor decides over 45 frames, and a burst is over in
 * 40. So a single event could still fill the entire field in one frame — and the
 * two that did are exactly the two that felt worst: Nova asked for 42 sparks
 * into a 40-slot pool, and a boss going up asked for 14 on top of its fireball.
 *
 * Capped per event instead, which is instant. It costs nothing visually: the
 * debris is a garnish on a screen already carrying a shockwave, a whiteout and a
 * 220px fireball, and nobody has ever counted the sparks.
 */
export const BURST_MAX = 14;

// --- Adaptive quality ---------------------------------------------------------
//
// `effectScale` above throttles on how much is on screen, which is a PROXY for
// cost. On a phone we've never run on, the proxy is wrong: a device two
// generations old blows the frame budget at an entity count a current one
// absorbs without noticing, and one much faster is throttling for nothing.
//
// So the loop also measures what frames are actually costing and steps the
// board's whole effect budget down a tier when it can't hold the target — then
// back up when it can. This is the only lever that genuinely scales to hardware
// we can't test: past a point a slow device cannot be made fast by drawing the
// same frame more cleverly, it has to draw less.
//
// Tier 0 is the full-fat game and is what every phone starts on; nothing below
// it touches anything the player can act on (hitboxes, speeds, spawn rates,
// damage) — only how lavishly the same events are drawn.
export interface QualityTier {
  particles: number; // live spark ceiling
  explosions: number; // concurrent fireball ceiling
  burst: number; // multiplier on every requested spark count
  /**
   * How many parallax layers to draw, counted from the BOTTOM of the stack.
   *
   * The background is the only thing in the game that costs the same whether
   * the board is empty or carrying a boss — every layer is a full-screen fill,
   * every frame, for the whole run. That makes it the largest SUSTAINED load
   * here, and sustained load is what heats a phone; the effect ceilings above
   * only ever cut spikes.
   *
   * Counted from the bottom because layers are stored far-to-near, so trimming
   * from the top drops foreground detail and keeps the sky — the standard
   * parallax LOD, and it keeps the most opaque layer (which lets the GPU skip
   * what is behind it) rather than throwing it away.
   */
  bgLayers: number;
  /** Whether the drifting planet field is drawn at all. */
  planets: boolean;
}
export const QUALITY_TIERS: QualityTier[] = [
  // bgLayers currently BINDS ON NOTHING: every set ships a single layer, so the
  // clamp in ParallaxBackground resolves to 1 at every tier. It is kept as the
  // ceiling it always was — a set that regains layers is trimmed automatically
  // rather than silently costing a full-screen blend per tier — but the real
  // background saving today is the planet field, which is why that drops at
  // tier 1 rather than waiting for tier 2.
  { particles: MAX_PARTICLES, explosions: MAX_EXPLOSIONS, burst: 1, bgLayers: 3, planets: true },
  { particles: 24, explosions: 5, burst: 0.6, bgLayers: 2, planets: false },
  { particles: 12, explosions: 3, burst: 0.35, bgLayers: 1, planets: false },
];

/**
 * A frame longer than this counts as dropped.
 *
 * 1.35 × a 60 Hz frame: comfortably past 16.7 ms so ordinary jitter doesn't
 * register, comfortably under 33 ms so we react before the game is visibly at
 * half rate.
 */
export const FRAME_BUDGET_MS = (1000 / 60) * 1.35;
/** Frames per decision — about three quarters of a second at target rate. */
export const QUALITY_SAMPLE = 45;
/** Share of a sample that must blow the budget before dropping a tier. */
export const QUALITY_DROP_FRAC = 0.3;
/**
 * …and the share below which we climb back up. Deliberately far lower than the
 * drop threshold: without that gap a device sitting exactly on the boundary
 * oscillates between tiers, and effects popping in and out is more distracting
 * than simply having fewer of them.
 */
export const QUALITY_RAISE_FRAC = 0.05;

/**
 * Show the on-screen frame-time readout.
 *
 * Driven by the build, not by `__DEV__`: the numbers that matter come from a
 * RELEASE build, because a dev build carries dev-mode React's overhead and
 * would send you after a problem the shipped game does not have.
 *
 * Enabled by building the `perf` EAS profile, which sets this env var — so
 * profiling never means editing source, and therefore never means remembering
 * to edit it back before shipping. `EXPO_PUBLIC_` vars are inlined at build
 * time, so this stays a compile-time constant and the dead branches vanish
 * from a normal build exactly as they did when it was a literal.
 *
 *   npx eas build --profile perf --platform android
 */
export const PERF_OVERLAY = process.env.EXPO_PUBLIC_PERF_OVERLAY === '1';

// --- Hearts (your health): every hit costs one, ❤️ pickups restore one ---
export const HEARTS_START = 3;
export const HEARTS_MAX = 10;
export const HEART_EVERY = 16; // s between ❤️ drops

// How sharply the hull tracks the finger (lerp constant, per second). Lives
// here as a constant rather than inline in the loop because the Thrusters
// upgrade scales it — see resolveShipStats().
export const DRAG_LERP = 30;

// --- Critical hits (Targeting Array / Overcharge upgrades) ---
// Crit chance starts at zero, so an un-upgraded ship never crits and plays
// exactly as it always did.
export const CRIT_BASE_MULT = 1.5; // damage multiplier at crit level 0
export const CRIT_COLOR = PALETTE.gold; // a crit is a reward, not a threat

// --- Player-carried bombs -----------------------------------------------------
// A held resource, not a gun: you choose the moment. One detonation wipes every
// enemy shot on screen and damages everything at once, which makes it the
// answer to a wall of bullet-hell you cannot thread. Capacity and damage both
// scale with the Bomb Bay upgrade.
export const BOMB_BASE_CAPACITY = 1; // bombs a hull carries with no upgrade
export const BOMB_NUKE_DMG = 18; // damage dealt to every enemy on screen
export const BOMB_BTN_SIZE = 58; // on-screen button diameter
export const BOMB_BTN_LEFT = 18;
export const BOMB_BTN_BOTTOM = 92; // mirrors the FIRE button on the other side
export const BOMB_FLASH_TIME = 0.35; // s of detonation whiteout
export const BOMB_FLASH_COLOR = PALETTE.goldHi;
export const BOMB_FLASH_ALPHA = 0.6;

// --- Camera shake -------------------------------------------------------------
// The play field is translated by a random offset each frame while `shake` burns
// down. Amplitude is quoted against a reference intensity so every hit in the
// game is expressed relative to one number.
//
// Shake means EXACTLY ONE THING: DAMAGE ARRIVED AT THE HULL. Explosions used to
// shake too — every enemy death, boss death, bomb, special and Nova — which
// meant the camera was moving almost continuously during a busy wave and the
// one event the player actually needs to feel was indistinguishable from the
// scenery. Kills are still sold by hit-stop, particles, the pitch ladder and the
// explosion sprite; none of those compete with damage for the same channel.
//
// "Damage arrived" rather than "a heart was lost", because a shield absorbing a
// shot is the same event from the player's side — something reached them — and
// a save that produced no physical feedback reads as a missed collision, which
// is how a player stops trusting the shield.
//
// Do not add a shake to an offensive event. If a new one needs weight, spend
// hit-stop or a flash, not the camera.
export const SHAKE_AMP = 14; // px of travel at the reference intensity
export const SHAKE_REF = 0.28; // the intensity SHAKE_AMP is quoted at
export const SHAKE_MAX = 0.28; // the hardest hit there is — losing a heart
/** A shot stopped by a shield or bulwark: felt, but well under a real hit. */
export const SHAKE_ABSORB = 0.16;
/**
 * How far the world can slide off its own edges at peak shake.
 *
 * RESOLVED — and the fix was to remove the need for this rather than to make it
 * work. Kept at 0 permanently; the history is worth recording because both the
 * bug and the workaround were expensive.
 *
 * The sky used to be drawn INSIDE the shake layer, so a hard hit slid it by up
 * to ±7px and dragged a strip of bare background into view along one edge.
 * The fix attempted was to inflate everything that has to cover the screen —
 * the sky's root to (-13, -13), every clip to larger than the screen. That
 * produced a black screen on device which was never reproducible off it: the
 * rendered tree measured exactly as intended and held no non-finite values, so
 * whatever failed did so in native compositing. It was set back to 0, trading a
 * thin seam for a working screen.
 *
 * The sky is now OUTSIDE the shake layer entirely (see GameScreen's render), so
 * nothing needs inflating: the one element that had to cover the screen through
 * a shake no longer moves during one. That also reads better — a shake sells
 * impact because the FOREGROUND moves against a fixed reference, and sliding
 * the distant backdrop with it weakened the punch — and it is cheaper, since
 * the largest views in the tree stop being re-composited under a changing
 * transform on every hit.
 *
 * Do not re-enable to "restore" anything. There is nothing left to compensate
 * for, and the device-only black screen was never diagnosed.
 */
export const SHAKE_MAX_PX = 0;

// Heart drops carry a drawn glyph rather than an emoji. They used to spawn with
// `emoji: ''`, so the pickup was a glow ring around nothing — the one drop in
// the game you could not identify by looking at it.
export const HEART_ICON = 28; // glyph size inside the OB_VIS ring

// --- Utility pickups (boons) --------------------------------------------------
export const BOON_EVERY = 13; // s between utility-pickup drops
export const BOON_VIS = 44; // rendered badge diameter
export const BOON_EMOJI = 24; // glyph size on the badge
// Active-boon chips are listed on the HUD under the gun readout.
export const BOON_CHIP_MAX = 4; // most chips shown at once (oldest drop off)
// The shield's visible bubble around the hull.
//
// Must CLEAR the drawn hull (AVATAR_HULL_D ≈ 81px). It was 78 — narrower than
// the ship it was supposed to be containing — so the wingtips sat outside the
// hoop even once the centring was fixed. Kept under BULWARK_RING so the shell
// still reads as the heavier of the two. Guarded by a test, because the two
// numbers are declared hundreds of lines apart and neither knows about the other.
export const SHIELD_RING = 92;
export const SHIELD_COLOR = PALETTE.plasma; // the player's own shield
/**
 * How many hits a shield absorbs before it shatters.
 *
 * A shield used to be blanket invulnerability for its whole duration, which
 * meant the correct play while it held was to stop dodging altogether — the
 * pickup deleted the game for six seconds and then handed it back. A budget
 * keeps the save worth having without ever making the board safe to ignore, and
 * it gives the boon a second failure state the player can actually feel.
 *
 * Three is deliberate: enough that one unlucky clip doesn't waste the pickup,
 * few enough that flying into a curtain still costs you the shield.
 */
export const SHIELD_HITS = 3;

// --- Elite enemies ------------------------------------------------------------
export const ELITE_AURA_SCALE = 1.5; // aura diameter against the enemy's hitbox
export const ELITE_AURA_ALPHA = 0.26;
// A sniper's charge-up telegraph: a growing bright ring so the fast shot that
// follows is always earned rather than a surprise.
/**
 * The charge tell, expressed as a FRACTION of the sprite it sits on.
 *
 * It used to be a flat 40px, which silently assumed every winding-up enemy was
 * OB_VIS (50px) wide. That held while the Sniper was the only user; the moment
 * a boss needed one, 40px would have been drawn *inside* a 168px giant and
 * shown nothing. 0.8 reproduces the Sniper's original 40px exactly
 * (0.8 × OB_VIS), so this is a generalisation, not a retune.
 */
export const WINDUP_RING_SCALE = 0.8;
/**
 * How much wider the ring starts, per second of charge remaining.
 *
 * The ring TIGHTENS onto the hull as the shot comes due, which is what makes it
 * a timer rather than a warning light — it used to be a static circle that
 * blinked on and off, carrying no information about *when* the shot would land
 * despite three comments describing it as growing. A longer charge visibly
 * starts wider, so a Sniper's 1.1s wind-up and a boss's 0.75s read as different
 * lengths without either needing to know the other's duration.
 */
export const WINDUP_RING_GROW = 0.5;
/** Opacity lost per second of charge remaining — it brightens as it closes. */
export const WINDUP_RING_FADE = 0.3;
export const WINDUP_RING_WIDTH = 2.5;

// --- Per-enemy fire ----------------------------------------------------------
// Archetypes run their own weapon clocks (see enemies.ts) ON TOP of the global
// volley. That would double the board's bullet pressure, so the global volley
// is scaled back by this much once archetypes are in play.
export const VOLLEY_DAMPEN = 0.38;

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
export const ENEMY_FIRE_EVERY = 2.9; // base seconds between enemy shots (gentler ramp)

/**
 * Global multiplier on every archetype's own weapon clock.
 *
 * The bullet wall late on had stopped being a test of dodging and started being
 * a test of luck — past a certain wave there was no gap left to move through.
 * Two systems feed it (the wave volley above and each archetype's own weapon),
 * so both are pulled back rather than one.
 *
 * A single scale rather than fifteen edited numbers in the ARCHETYPES table:
 * the RELATIVE rates are the archetypes' identity — a sniper is slow and
 * deliberate, a spinner is a hose — and rewriting them individually would drift
 * that apart. This makes everything fire less often while keeping who is who.
 *
 * Density, not total volume, is what makes a pattern undodgeable — so this pairs
 * with the HP rise in baseWaveHp: enemies live longer and fire the same number
 * of shots across their life, just spread out enough to leave gaps.
 */
export const ARCH_FIRE_SCALE = 1.35;
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
// Enemy fire is ONE hue, forever.
//
// This used to cycle eight colours by wave, which meant the thing that ends the
// run wore friendly green on wave 4, reward gold on wave 3, and the player's own
// cyan on wave 8. Wave identity now comes from sprite and scale instead — the
// two channels that can vary without ever lying about allegiance.
//
// Kept as an array so every existing caller (and the shape test) works unchanged;
// they simply always resolve to the same hostile hue.
export const WAVE_COLORS = [PALETTE.threat];

// --- Enemy art (2D Space Shooter pack): a new alien design every SHIP_WAVES waves ---
export const SHIP_WAVES = 5; // waves each design lasts
// The full cast, twelve designs. Six of these were sitting unused in the art
// pack while fifteen archetypes shared the other six, cycled by WAVE — so a
// Sniper and a Kamikaze looked identical and the same enemy changed appearance
// every five waves for no reason. Art is now chosen by ARCHETYPE (see
// ARCHETYPES[].sprite), so a silhouette means a behaviour.
export const ENEMY_SHIPS = [
  require('../../assets/obstacles/enemy01.png'), // 0  hornet — small, angular
  require('../../assets/obstacles/enemy02.png'), // 1  hornet variant
  require('../../assets/obstacles/enemy03.png'), // 2  hornet variant
  require('../../assets/obstacles/enemy04.png'), // 3  hornet variant
  require('../../assets/obstacles/enemy05.png'), // 4  squid — broad, heavy
  require('../../assets/obstacles/enemy06.png'), // 5  squid variant
  require('../../assets/obstacles/enemy07.png'), // 6  beetle — compact, armoured
  require('../../assets/obstacles/enemy08.png'), // 7  beetle variant
  require('../../assets/obstacles/enemy09.png'), // 8  octopus — many-limbed
  require('../../assets/obstacles/enemy10.png'), // 9  octopus variant
  require('../../assets/obstacles/enemy11.png'), // 10 octopus variant
  require('../../assets/obstacles/enemy12.png'), // 11 octopus variant
];
/**
 * Wave-based art selection.
 *
 * Superseded by per-archetype sprites for ordinary enemies, but still used by
 * BOSSES (which have no archetype) and by cards restored from a save written
 * before archetype art existed.
 */
export const shipForWave = (wave: number) =>
  Math.max(0, Math.min(Math.floor((wave - 1) / SHIP_WAVES), ENEMY_SHIPS.length - 1));

// --- Bosses: a mini boss holds every 5th wave, a giant every 10th ---
export const BOSS_MINI_IMG = require('../../assets/obstacles/boss_mini.png');
export const BOSS_GIANT_IMG = require('../../assets/obstacles/boss_giant.png');
export const BOSS_MINI_VIS = 104; // rendered size (px)
export const BOSS_MINI_HIT = 82; // hitbox (forgiving, smaller than the visual)
export const BOSS_GIANT_VIS = 168;
export const BOSS_GIANT_HIT = 132;
/**
 * Boss health. Bosses are meant to be an ORDEAL.
 *
 * These are large on purpose, and the per-wave slope is steep on purpose: an
 * early mini should be a real fight, and a late giant should be the hardest
 * thing in the run by a distance.
 *
 * The honest risk of numbers this size is the one every long boss has — that
 * it becomes a slog. The mitigation is NOT smaller numbers, it is that the
 * health is subdivided into many phases (3 for a mini, 5 for a giant; see
 * BOSS_PHASES) and every one of them changes the attack AND the movement. A
 * player is never doing the same thing for more than a fifth of the bar, so the
 * length reads as an escalating fight rather than one long health bar.
 *
 * Rough fight lengths, at ~3 damage/second (single gun, ZERO upgrades — the
 * floor, not the expectation):
 *
 *   mini  w5  = 170 hp  ~57s        giant w10 = 560 hp  ~3m
 *   mini  w15 = 330 hp  ~110s       giant w20 = 900 hp  ~5m
 *
 * Those floor numbers are deliberately brutal. A player who has actually spent
 * their coins runs 4–8× that damage (dmgMult stacks with fireIntervalMult, and
 * gun levels add parallel shots), which brings a giant back to well under a
 * minute. That gap IS the design: upgrades are what a boss measures.
 */
export const BOSS_MINI_HP = (wave: number) => 90 + wave * 16;
export const BOSS_GIANT_HP = (wave: number) => 220 + wave * 34;
// Baseline sway. Each boss phase scales these — see BOSS_PHASES in bosses.ts.
export const BOSS_SWAY_AMP = 0.3; // fraction of screen width the boss sways from center
export const BOSS_SWAY_FREQ = 0.7; // rad/s
/**
 * How fast the sway's WIDTH eases toward a new phase's target, per second.
 *
 * The phase multipliers step the instant health crosses a band. Sway SPEED is
 * made continuous by accumulating the sine's phase (see bossSway) — but width
 * multiplies the sine directly, so stepping it would still pop the boss
 * sideways by up to ~34px at the extremes of its arc. Easing spends about half a
 * second widening instead, which also reads better: the boss winds up into its
 * new phase rather than snapping into it.
 */
export const BOSS_SWAY_AMP_LERP = 2.5;

// --- Gun power-up projectiles (from the laser/bullet FX pack). Each falling
// pickup wears its gun's own shot art so you can read what it grants before
// grabbing it. The 'double' pickup instead shows the avatar's own shot doubled
// (resolved in the render, since it depends on the equipped ship). ---
export const SHOT_BOMB_IMG = require('../../assets/bullets/gun_bomb.png'); // amber blast starburst
export const SHOT_LASER_IMG = require('../../assets/bullets/gun_laser.png'); // cyan thin beam
export const SHOT_HOMING_IMG = require('../../assets/bullets/gun_rocket.png'); // green round seeker

// --- Sprite render sizes ---
// Shared by the live render and the boot preloader: an image warmed at a
// different size than it's drawn at can decode a second bitmap on first use,
// which is exactly the late-paint this preloading exists to prevent.
export const ENEMY_SHIP_VIS = 56;
export const AVATAR_IMG_W = 56;
export const AVATAR_IMG_H = 64;

// --- Where the hull is actually DRAWN ----------------------------------------
// The rocket view is parked at the origin and moved entirely by transform, so
// these four numbers are what decide where the sprite lands. They were inline
// literals in GameScreen's render; they live here because anything drawn AROUND
// the ship has to agree with them, and nothing could agree with a magic number
// it could not see.
export const AVATAR_ART_SCALE = 1.45; // the hull is drawn 45% larger than its box
export const AVATAR_ART_DX = -36; // half the 72-wide rocket view, centring it on avatarX
export const AVATAR_ART_DY = -22; // lifts the sprite, so the nose leads the hitbox
export const AVATAR_ART_MARGIN = 2; // jetImg's own margin inside that view

/** The rocket view's laid-out height: its margin plus the image box. */
const AVATAR_VIEW_H = AVATAR_ART_MARGIN + AVATAR_IMG_H;

/**
 * Y offset from `avatarY` to the CENTRE OF THE DRAWN HULL.
 *
 * NOT the same as the hitbox centre (`avatarY + AVATAR_SIZE / 2`), and that gap
 * is the entire reason this exists. The hitbox is deliberately small and sits
 * low; the sprite is drawn larger and lifted. The two centres are ~15px apart,
 * so a hoop centred on the hitbox renders visibly BEHIND the ship — nose out
 * the front, bubble trailing at the back. That is what the shield did.
 *
 * Derived rather than measured so it cannot drift when the render is retuned:
 * the transform puts the view's centre at `avatarY + AVATAR_ART_DY + h / 2`,
 * and the image box sits fractionally below that centre before the scale
 * multiplies the difference.
 *
 * Safe against `resizeMode="contain"`: contain CENTRES the art in its box, so
 * the drawn hull's centre is the box's centre whatever the source aspect is.
 */
export const AVATAR_HULL_CY =
  AVATAR_ART_DY +
  AVATAR_VIEW_H / 2 +
  (AVATAR_ART_MARGIN + AVATAR_IMG_H / 2 - AVATAR_VIEW_H / 2) * AVATAR_ART_SCALE;

/**
 * The drawn hull's diameter.
 *
 * Every hull sprite is square source art, so `contain` fits it to the SHORTER
 * side of the image box before the scale is applied — the hull is 56×56 drawn,
 * not 56×64. Anything meant to enclose the ship has to clear this.
 */
export const AVATAR_HULL_D = Math.min(AVATAR_IMG_W, AVATAR_IMG_H) * AVATAR_ART_SCALE;

/**
 * The player's hurtbox — centred on AVATAR_HULL_CY, like everything else.
 *
 * Deliberately far smaller than the drawn hull (~81px). That gap is genre
 * convention and it is what makes dense patterns survivable: the ship you see is
 * the fantasy, the box that can actually be hit is a fraction of it.
 *
 * The SIZE here is unchanged from the box this replaced (44×44) — only its
 * centre moved. It used to hang ~15px below the sprite, so its lower edge sat in
 * empty space under the ship and collected shots that visually passed
 * underneath, while the nose was unhittable. Same area, honest position.
 */
export const AVATAR_HIT_W = AVATAR_SIZE - 12;
export const AVATAR_HIT_H = AVATAR_SIZE - 12;
// The power-up shots are drawn the same length as the default bolt
// (PLAYER_SHOT_LEN = 62), each at its own source aspect.
// Bomb: an amber blast starburst (radial, ~134×143). The heavy hitter — drawn
// biggest of all shots, and symmetric so it needs no travel rotation.
export const SHOT_BOMB_W = 100;
export const SHOT_BOMB_H = 106;
// Laser: a long, thin cyan beam — a lance, deliberately unlike the ship's fat
// bolt. Source points +x (pre-rotated from the pack's up-facing sprite); the
// render lays it out along travel then rotates it -90° to point up. Drawn a
// touch longer than the mechanical reach (LASER_LEN), the extra being trailing
// tail behind the tip. Drawn bigger than the default bolt — it's a power-up.
// Source aspect ~2.41.
export const SHOT_LASER_LEN = 116;
export const SHOT_LASER_THICK = 48;
// Homing seeker: a bright green orb with a short cone tail — a blob, not a bolt
// or a beam, and high-contrast on the dark space background — rotated to face
// its heading (round head leads, tail trails). Drawn bigger than the default
// bolt. Source aspect ~1.07 (near-square).
export const SHOT_HOMING_LEN = 70; // along travel
export const SHOT_HOMING_THICK = 65;
/**
 * How large an enemy shot is drawn, as a multiple of its hitbox.
 *
 * This is the side of the sprite's AREA, not its width. Sizing by width (which
 * is what this did) meant a shot's drawn area depended entirely on how slim its
 * art happened to be: at 3.2 the Drone's 63×165 bolt covered 2.6× the pixels of
 * the Boss's near-square one, off the same 11px hitbox. So the thinnest bullets
 * were the visually largest, which is exactly backwards.
 *
 * Normalising on area makes every shot read at the same weight whatever its
 * proportions, and lets this one number mean something: a shot covers roughly
 * this many times its hitbox in each direction. Turn it down to shrink all
 * fourteen together; the sprites keep their own proportions either way.
 *
 * Note the old width-based 3.2 is NOT comparable to a number here: it worked
 * out to an area equivalent of ~4.1 for a mid-aspect shot, so dropping straight
 * to 2.3 cut the drawn area by about 70% and left the slim bolts too small to
 * pick out against the background starfield. 2.9 keeps the chunky shots close
 * to their original footprint while the over-long ones stay well down — the
 * Drone bolt was 35×92 and is now 20×52.
 */
export const ENEMY_BULLET_ART_SCALE = 2.9;

/** Drawn size of an enemy shot: same area for every shape, own aspect kept. */
export const enemyShotBox = (size: number, aspect: number) => {
  const w = size * ENEMY_BULLET_ART_SCALE * Math.sqrt(aspect);
  return { w, h: w / aspect };
};

// --- Enemy bullet art: every ship tier fires its own missile sprite (from the
// "2D Space Shooter" pack) instead of a plain colored dot. Each is a distinct
// design/color so the tiers read apart. There are 6 ship tiers and 5 shots, so
// they cycle (shipIdx % 5): the 6th tier reuses the first. The sprites point UP
// (nose at top) on a square canvas — the render rotates them to face travel.
// A shot is coloured to match the HULL THAT FIRES IT, within ~14° of hue, so a
// bullet is attributable to its shooter at a glance. The cast is mostly green
// and teal, so most enemy fire is too; only the red hulls fire red.
//
// This deliberately relaxes the old "every enemy shot is CRIMSON" rule, which
// existed because bullets once cycled eight hues by WAVE — that is what put
// friendly green on wave 4 and the player's own cyan on wave 8. Hue tied to the
// shooter is not that bug: it is stable, it never changes mid-run, and it adds
// information rather than noise.
//
// What it costs: three hulls now fire within ~10° of an enemy shot's hue —
// Specter (teal) against the Sniper/Teleporter/Spinner, Valkyrie (blue) against
// the Seeker, and Raptor (violet) against the Strafer. Direction of travel and
// silhouette are what separate friend from foe for those pilots. If that proves
// too subtle in play, the fix is to re-copy those three from a further-away
// colour folder — the shapes and every aspect below stay exactly as they are.
//
// All of them point UP (bright head, tail trailing below); the render rotates
// them onto their velocity.
export const ENEMY_SHOTS = [
  // shape                                              hull it is fired by
  require('../../assets/bullets/eshot_grunt.png'), // 0  slim bolt      RED    enemy01
  require('../../assets/bullets/eshot_scout.png'), // 1  small bolt     LIME   enemy02
  require('../../assets/bullets/eshot_tank.png'), // 2  heavy slug      GREEN  enemy05
  require('../../assets/bullets/eshot_weaver.png'), // 3  narrow taper  RED    enemy03
  require('../../assets/bullets/eshot_diver.png'), // 4  long dart      RED    enemy03
  require('../../assets/bullets/eshot_sniper.png'), // 5  sharp lance   TEAL   enemy07
  require('../../assets/bullets/eshot_gunner.png'), // 6  stubby pellet GREEN  enemy06
  require('../../assets/bullets/eshot_spiraller.png'), // 7  round orb  TEAL   enemy09
  require('../../assets/bullets/eshot_strafer.png'), // 8  mid bolt     VIOLET enemy04
  require('../../assets/bullets/eshot_blinker.png'), // 9  compact slug TEAL   enemy08
  require('../../assets/bullets/eshot_sentinel.png'), // 10 fat teardrop RED   enemy11
  require('../../assets/bullets/eshot_seeker.png'), // 11 chunky missile BLUE  enemy12
  require('../../assets/bullets/eshot_splitter.png'), // 12 squat round GREEN  enemy05
  // Bosses cycle their art by wave, so there is no one hull to match. Red: the
  // colour that reads as danger regardless of what the boss happens to look like.
  require('../../assets/bullets/eshot_boss.png'), // 13 the biggest     RED
];
/** Source width / height, so each shot keeps its own proportions. */
export const ENEMY_SHOT_ASPECT = [
  63 / 165,
  70 / 157,
  221 / 241,
  89 / 164,
  95 / 229,
  89 / 203,
  93 / 111,
  121 / 131,
  151 / 159,
  119 / 132,
  116 / 191,
  186 / 241,
  134 / 143,
  180 / 184,
];

/**
 * Which shot each archetype fires.
 *
 * Art follows BEHAVIOUR, exactly like `ArchetypeDef.sprite` does for the hulls.
 * It used to be picked by ship tier (`shipIdx % 5`), which meant the pairs that
 * share a hull sprite — Bulwark/Splitter, Weaver/Dive Bomber, Scout/Kamikaze —
 * also shared a bullet, and a bullet told you nothing a glance at the shooter
 * didn't already. Now the shot in flight identifies who fired it even after the
 * shooter is off-screen or dead.
 *
 * One entry is never rendered and is an alias rather than its own art:
 * Kamikaze has `fire: 'none'`.
 */
export const ENEMY_SHOT_FOR_ARCH: Record<ArchKind, number> = {
  grunt: 0,
  scout: 1,
  tank: 2,
  weaver: 3,
  diver: 4,
  kamikaze: 0, // never fires
  sniper: 5,
  gunner: 6,
  spiraller: 7,
  strafer: 8,
  blinker: 9,
  sentinel: 10,
  seeker: 11,
  splitter: 12,
};

/** Bosses are not archetypes, so they carry the heaviest shot explicitly. */
export const BOSS_SHOT = 13;

/** Art index for a shooter, or undefined for the plain dot. */
export const enemyShotFor = (arch: ArchKind | undefined): number | undefined =>
  arch ? ENEMY_SHOT_FOR_ARCH[arch] : undefined;

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
export interface BgLayer {
  src: number;
  speed: number;
  alpha: number;
  /**
   * Tile shape overrides, for a layer whose art is not the same proportion as
   * the rest of its set.
   *
   * The star veil is a square seamless tile shared by every sky, but the
   * spbg sets tile at 16:9 — without an override the veil would be stretched
   * to that and every star drawn as a short vertical streak. Each layer wraps
   * on its OWN period (see layerPeriod), so mixing shapes in one set is safe.
   */
  aspect?: number;
  mirror?: boolean;
}
// A distant planet at a fixed horizontal spot in the sky. Its size encodes
// distance: a big, opaque planet reads as near; a small, fainter one as far.
export interface PlanetItem {
  src: number;
  xFrac: number; // center x as a fraction of screen width
  sizeFrac: number; // diameter as a fraction of screen width — bigger = nearer
  opacity: number; // fainter = farther
}
// Each environment cycles through a small cast of mixed-size planets, so a
// couple sit on screen at once at different apparent distances; each drifts
// slowly down and off, and the next takes its place.
export interface PlanetLayer {
  items: PlanetItem[];
}
export interface BgSet {
  base?: number; // static full-screen composite behind the layers
  aspect: number; // displayed tile height = screen width × this
  mirror: boolean; // mirror-tile non-seamless art; seamless tiles repeat plainly
  layers: BgLayer[];
  planet?: PlanetLayer; // optional far planet drifting through this sky
}

/**
 * How fast the planet field drifts, against the star fields' 0.18 and 0.30.
 *
 * The GAP between the two is the depth cue. A planet has to be visibly
 * overtaken by the stars in front of it; at similar speeds the veil merely
 * covers it and the eye reads both as being the same distance away.
 */
export const PLANET_SPEED = 0.04;
export const PLANET_SPACING = SCREEN.H * 0.58; // vertical gap between planets → 2+ on screen at once

// Planet sprites (SBS 2D Planet Pack, shaded 512 → 256).
//
// Only the worlds the three surviving skies actually place. Six more shipped
// with the pack and were dropped along with the backgrounds that used them —
// a `require` here is what pulls a file into the bundle, so an unplaced planet
// is pure download weight.
const PLANET_REDGIANT = require('../../assets/background/planet_redgiant.png');
const PLANET_ORANGE = require('../../assets/background/planet_orange.png');
const PLANET_GLACIAL = require('../../assets/background/planet_glacial.png');
const PLANET_MAGMA = require('../../assets/background/planet_magma.png');
const PLANET_LUNAR = require('../../assets/background/planet_lunar.png');
const PLANET_ARID = require('../../assets/background/planet_arid.png');
const PLANET_BARREN = require('../../assets/background/planet_barren.png');
const PLANET_AQUAMARINE = require('../../assets/background/planet_aquamarine.png');
const PLANET_BLUEGIANT = require('../../assets/background/planet_bluegiant.png');

// --- The starfield ------------------------------------------------------------
//
// TWO fields, drawn by scripts/make-star-veil.mjs, straddling the planets:
//
//   far    dense, faint, tiny        0.18   behind the planets
//   near   sparse, brighter, larger  0.30   in front of them
//
// The pair does two jobs one layer cannot.
//
// OCCLUSION. Planets read as stickers on the lens when nothing ever passes
// between them and the player, and no amount of shrinking or fading fixes that
// because it is not the cue the eye uses. Reordering the original layers could
// not fix it either — they are opaque, so a planet moved behind them is not
// distant, it is gone. Something transparent has to be in front.
//
// DEPTH WITHIN THE FIELD. Real stars are not all the same distance away. One
// plane of them looks like a plane no matter how it is drawn or how fast it
// moves; two planes at different rates is the cheapest thing that does not.
//
// --- On the speeds ------------------------------------------------------------
//
// Both are SLOW, and close to the nebula's own 0.15. The first attempt ran a
// single field at 0.45 — triple the sky behind it — and the whole starfield
// swept past like a scrim dragged over the screen, which is precisely the
// artificial look this replaces. Stars are the most distant things in frame and
// must be among the slowest. The occlusion cue is preserved by slowing the
// PLANETS below them instead (PLANET_SPEED), so the stars gently overtake
// rather than race.
//
// Shared by every sky: stars are white and need not match the nebula behind
// them, so this is two bitmaps and two decodes for the whole game.
const STAR_FAR = require('../../assets/background/star_far.png');
const STAR_NEAR = require('../../assets/background/star_near.png');

/**
 * Both star fields, in draw order.
 *
 * Square seamless tiles, so they override the tile shape of any set that is
 * not square (see BgLayer.aspect) rather than being stretched into vertical
 * streaks.
 *
 * Group alpha stays 1 and the PNGs carry their own per-pixel alpha: a group
 * opacity below 1 asks the platform for an offscreen compositing buffer every
 * frame, where per-pixel alpha is free and looks better — every star keeps its
 * own brightness instead of all of them being faded by the same amount, which
 * is the whole point of drawing a magnitude distribution in the first place.
 */
const starLayers = (): BgLayer[] => [
  { src: STAR_FAR, speed: 0.18, alpha: 1, aspect: 1, mirror: false },
  { src: STAR_NEAR, speed: 0.3, alpha: 1, aspect: 1, mirror: false },
];

const SPBG_ASPECT = 1280 / 720;
const spbgSet = (base: number, far: number, mid: number, near: number): BgSet => ({
  base,
  aspect: SPBG_ASPECT,
  mirror: true,
  // ONE layer, the far one.
  //
  // Every parallax layer is a full-screen alpha blend, every frame, for the
  // whole run — the largest sustained GPU cost in the game and the thing that
  // heats the phone. The near and mid layers are also the fastest-moving and the
  // least legible: at speed 0.5–1.0 they read as noise over the play field.
  //
  // The FAR layer is the one kept everywhere, because it is the slowest and
  // therefore the one that reads as a backdrop rather than as motion. These sets
  // still have their static `base` behind it, so losing two layers costs depth
  // rather than content.
  // The far layer, then the VEIL. ParallaxBackground draws the planet field
  // between the last two layers, so a second layer here is what finally puts
  // the planets behind something — with one layer they were always in front of
  // everything, which is exactly why they read as pasted on.
  layers: [{ src: far, speed: 0.2, alpha: 0.4 }, ...starLayers()],
});

// Shared SBS starfield tiles (opaque black — partial alpha lets the nebula
// underneath show through while the stars stay visible).
const SBS_STARS_MID = require('../../assets/background/sbs_stars_mid.png');
const SBS_STARS_NEAR = require('../../assets/background/sbs_stars_near.png');
const SBS_PURPLE = require('../../assets/background/sbs_purple.png');
const SBS_BLUE = require('../../assets/background/sbs_blue.png');
const sbsSet = (nebula: number): BgSet => ({
  aspect: 1,
  mirror: false,
  // Just the nebula — see the note in spbgSet. It is both the slowest layer
  // (speed 0.15) and the one carrying the set's colour, and unlike the spbg sets
  // these have no static base behind them, so it has to be the opaque one.
  layers: [{ src: nebula, speed: 0.15, alpha: 1 }, ...starLayers()],
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
      // Just the veil. It is the slowest layer here (0.15) exactly as `far` is
      // in the other sets, so "keep the far one" picks it on the same rule —
      // and it happens to be the layer the background is named for. Raised to
      // full alpha now that there are no starfields underneath for it to let
      // through; at 0.6 over bare void it would have read as washed out.
      // Spelled out rather than using sbsSet, but it still needs the veil — the
      // planets have to have something in front of them or they read as pasted
      // on, and this is the STARTER sky, so it is the first one anyone sees.
      layers: [{ src: SBS_PURPLE, speed: 0.15, alpha: 1 }, ...starLayers()],
      // Warm/neutral worlds against the cool violet haze.
      planet: {
        items: [
          { src: PLANET_REDGIANT, xFrac: 0.68, sizeFrac: 0.21, opacity: 0.55 }, // near
          { src: PLANET_LUNAR, xFrac: 0.3, sizeFrac: 0.1, opacity: 0.43 }, // far
          { src: PLANET_ARID, xFrac: 0.6, sizeFrac: 0.15, opacity: 0.5 }, // mid
        ],
      },
    },
  },
  {
    id: 'azure',
    name: 'Azure Drift', // teal/blue wisps
    price: 120,
    preview: SBS_BLUE,
    // Warm worlds pop against the teal/blue.
    set: {
      ...sbsSet(SBS_BLUE),
      planet: {
        items: [
          { src: PLANET_ORANGE, xFrac: 0.28, sizeFrac: 0.2, opacity: 0.55 }, // near
          { src: PLANET_MAGMA, xFrac: 0.7, sizeFrac: 0.11, opacity: 0.45 }, // far
          { src: PLANET_BARREN, xFrac: 0.45, sizeFrac: 0.14, opacity: 0.5 }, // mid
        ],
      },
    },
  },
  {
    id: 'ember',
    name: 'Ember Reach', // stellar_03 — orange wisps on blue-grey
    price: 240,
    preview: require('../../assets/background/bg2_base.jpg'),
    set: {
      ...spbgSet(
        require('../../assets/background/bg2_base.jpg'),
        require('../../assets/background/bg2_far.jpg'),
        require('../../assets/background/bg2_mid.jpg'),
        require('../../assets/background/bg2_near.jpg')
      ),
      // Cool icy worlds contrasting the warm ember wisps.
      planet: {
        items: [
          { src: PLANET_GLACIAL, xFrac: 0.3, sizeFrac: 0.21, opacity: 0.55 }, // near
          { src: PLANET_AQUAMARINE, xFrac: 0.7, sizeFrac: 0.11, opacity: 0.45 }, // far
          { src: PLANET_BLUEGIANT, xFrac: 0.5, sizeFrac: 0.15, opacity: 0.5 }, // mid
        ],
      },
    },
  },
];

// Every background's parallax set — still consumed by the boot preloader.
export const BG_SETS: BgSet[] = BACKGROUNDS.map((b) => b.set);
export const BG_PX_PER_M = 0.4; // near-layer scroll px per meter climbed
/**
 * How much the background art is darkened so gameplay reads on top of it.
 *
 * BAKED INTO THE ART — do not re-apply it at runtime. This was a #05070E quad at
 * this opacity drawn over the whole sky every frame; being a full-screen
 * translucent blend it also forced every layer beneath it to be drawn and read
 * back, and it cost exactly the same whether the board was empty or full.
 *
 * Darkening is affine and source-over is a convex combination, so the two
 * commute and moving it into the pixels is exact rather than approximate. It
 * lives on as a number because two things still need it: the bake script that
 * applies it (scripts/bake-bg-dim.mjs), and the menu dim, which has to subtract
 * what the art already carries. Change it and re-run the script — changing it
 * alone now does nothing.
 */
export const BG_DIM = 0.42;

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
// Font loading gets the same safety net the asset pass has. A missing or slow
// font file must never brick boot — the app falls back to the system face,
// which is ugly but playable, where a hung gate is neither.
export const FONT_GRACE_MS = 4000;

export const GUN_LABEL: Record<string, string> = {
  double: 'DOUBLE FIRE',
  bomb: 'BOMBS',
  laser: 'LASER',
  homing: 'HOMING',
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
// Which icon represents each gun, for the HUD chip and the pickup guide.
export const GUN_ICON: Record<GunKind, IconName> = {
  single: 'gun-double',
  double: 'gun-double',
  bomb: 'gun-bomb',
  laser: 'gun-laser',
  homing: 'gun-homing',
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
// A boss payout is released a few coins at a time rather than all at once: the
// whole fan appearing on one frame mounts its entire view subtree on the frame
// the boss also explodes, which is the single busiest frame in the game.
export const COIN_DROP_RELEASE = 3; // coins per release
export const COIN_DROP_EVERY = 0.05; // s between releases → 14 coins in ~0.25s
export const COIN_GOLD = PALETTE.gold; // face
export const COIN_GOLD_EDGE = '#C98A16'; // rim
export const COIN_GOLD_SHINE = '#FFE9A8'; // inner highlight


// --- Player fire-shot art. Each avatar has its own signature bolt (the normal
// gun's projectile); pricier ships get flashier ones. Source sprites are
// horizontal (point +x) and the renderer rotates them to face travel. `aspect`
// is the source width/height; the shot is drawn PLAYER_SHOT_LEN px along its
// length, with thickness = PLAYER_SHOT_LEN / aspect. ---
export const PLAYER_SHOT_LEN = 62; // px, the bolt's on-screen length

export interface ShotArt {
  src: number;
  aspect: number;
  /**
   * The hull's identity colour. No longer a tint — the art is genuinely this
   * colour now — but the UI still reads it, so the shop card's tier edge and the
   * menu's special label match the bolt the player will actually see.
   */
  tint: string;
}

// --- Ship specials: the FIRE button ultimate ---
// The free starter aside, every hull carries one signature attack, so coins buy
// a new way to play and not just a repaint. One shared meter refills on its own
// from empty; when it tops out the button lights up and a tap spends it all.
// Seconds to refill the meter from empty. Every run starts the vessel at zero,
// so the first special is always earned rather than handed over. Short enough
// that the fill is visibly, continuously moving: at this rate the level climbs
// a pixel every few frames and the colour ramps the whole way up, where a long
// charge creeps a pixel every half-second and reads as a static bar.
// Retained for the pickup guide's wording and as the reference figure the
// Energy Cell upgrade scales against. The meter is no longer FILLED by time —
// see the earned-energy constants below.
export const SPECIAL_CHARGE_SEC = 5;

// --- Energy: earned, not handed over -----------------------------------------
// A 5-second passive trickle made the special into admin — roughly twelve taps
// a minute for a guaranteed identical effect, with no decision attached. Energy
// now comes from play, so a full meter is evidence you did something, and
// holding one is a choice with a cost.
export const ENERGY_PER_KILL = 0.012; // fraction of the meter per enemy
export const ENERGY_PER_ELITE = 0.03;
export const ENERGY_PER_BOSS = 0.15;
export const ENERGY_PER_GRAZE = 0.004;
export const ENERGY_PER_FLAWLESS_WAVE = 0.06;
// A floor so a player can never be locked out of the mechanic during a lull
// (between waves, or while a boss is descending). Deliberately slow: this alone
// takes over a minute and a half to fill the meter, so it is a safety net and
// never a viable way to farm specials.
export const ENERGY_IDLE_PER_SEC = 0.01;
// The meter keeps filling past full, to here. Firing at 1.0 is the normal
// special; firing at 2.0 is an enhanced version — which is what turns every
// armed button into "spend it now to survive, or bank it for the boss?".
export const ENERGY_OVERCHARGE = 2;
export const OVERCHARGE_EDGE = PALETTE.gold; // rim once the meter is past full
export const OVERCHARGE_FILL = PALETTE.amber;

// --- Hit-stop ----------------------------------------------------------------
// A few frames of frozen simulation on impact. The cheapest way to make a hit
// feel like it landed rather than like a number changed. Values TAKE THE MAX
// rather than accumulating, so a chain of kills can never compound into a
// noticeable stall.
//
// Roughly halved once already, from the original 0.045 / 0.08 / 0.15 / 0.25. At
// those values `update()` returned early for 3 frames on an ordinary kill and 15
// on a boss, and because the freeze is TRIGGERED by the kill it landed exactly
// when the screen was busiest — so it read as the game stuttering under the
// explosion rather than as impact.
//
// Cut again on the two that are FORCED (`hitStop(…, true)`), which are the only
// ones that always land and the two longest: a boss kill and a special
// activation. Those are also the two moments players reported as lag, and at
// 0.14s a boss kill was eight frozen frames — long enough to stop reading as
// weight and start reading as a dropped frame. Now roughly five and three.
//
// The ladder must stay strictly ascending: an elite has to freeze longer than a
// drone, a special longer than an elite, a boss longer than all of it. That
// ordering is what makes the freeze legible as "this was a bigger deal" instead
// of as inconsistent performance.
//
// Nothing but feel depends on these numbers, and `update()` is the only reader —
// so raise them back if the punch feels lost.
export const HITSTOP_KILL = 0.03; // ~2 frames — the base beat, on every kill
export const HITSTOP_ELITE = 0.04;
export const HITSTOP_BOSS_PHASE = 0.05; // every special activation
export const HITSTOP_BOSS_KILL = 0.08; // ~5 frames, down from ~8
export const HITSTOP_MAX = 0.1; // ceiling, so nothing can freeze the game longer

// --- Chain HUD ---------------------------------------------------------------
export const CHAIN_HUD_COLOR = PALETTE.gold;
export const CHAIN_HUD_HOT = '#FFF6D0'; // white-hot gold, NOT hostile magenta
export const GRAZE_COLOR = PALETTE.plasma; // grazing is a player skill
export const SCORE_COLOR = PALETTE.ink;
export const SPECIAL_BTN_SIZE = 76; // diameter of the on-screen FIRE button
export const SPECIAL_BTN_RIGHT = 18; // px from the right edge
export const SPECIAL_BTN_BOTTOM = 88; // px from the bottom — under the ship's rest spot, in thumb reach
// The meter reads as a vessel filling with charged coolant: it pours in white
// and deepens to a shiny blue as it comes up to full, so the colour alone tells
// you roughly how close you are without reading the level. Interpolated across
// three stops rather than two — a straight white→blue blend passes through a
// washed-out grey-blue in the middle, and the pale mid stop keeps it bright.
export const SPECIAL_FILL_EMPTY = '#FFFFFF';
export const SPECIAL_FILL_MID = '#7FC4FF';
export const SPECIAL_FILL_FULL = '#1E88FF';
export const SPECIAL_READY_EDGE = '#5AB9FF'; // rim once it's armed
export const SPECIAL_SURFACE = 'rgba(255,255,255,0.9)'; // bright line riding the top of the fill

// Specter — PHANTOMS: two spectral copies of your hull fade in on either side
// and fire whatever you're firing, then dissolve. Triples your output while
// they last rather than changing the shot itself — a haunting, not a weapon.
export const PHANTOM_TIME = 7; // s the ghosts fly with you
export const PHANTOM_OFFSET = 48; // px each ghost flanks the hull
export const PHANTOM_ALPHA = 0.45; // ghosts read as see-through, never as a second real ship
export const PHANTOM_TINT = '#BFC9FF'; // pale spectral blue-white for the summon burst

// Raptor — TALONS: a bird-of-prey rake. A fan of piercing claws goes out every
// TALON_BURST_EVERY for TALON_BURST_TIME, and the whole fan swings side to side
// as it fires, so the burst reads as a rake being walked across the sky rather
// than one pattern stamped repeatedly.
//
// --- Rebalanced: fewer, heavier claws -------------------------------------
//
// This was 7 claws every 0.16s at 2 damage. A claw flies from the hull to the
// top edge in about a second, so at that cadence the barrage peaked near FIFTY
// live claw views at once — each a native view carrying a rotation — and it
// measurably dropped frames on device. Volume was the ability's identity, but
// fifty views is not something the renderer can absorb on top of a formation
// that is itself shooting.
//
// The trade: roughly half the projectiles, more than double the damage each, so
// the barrage hits at least as hard as it used to (56 claws × 5 = 280, against
// 119 × 2 = 238) while costing the frame about half as much. Two changes keep
// the RAKE intact rather than leaving a thin fan with holes in it:
//
//   - TALON_SWEEP_AMP is widened. Four claws across the same spread leave gaps
//     twice as wide, so the fan now swings far enough that successive volleys
//     interleave and fill them. Coverage is preserved over time instead of all
//     at once, which is what a rake actually is.
//   - TALON_THICK is up, so each claw covers more of the gap on its own.
export const TALON_COUNT = 4; // claws per fan
export const TALON_SPREAD = 1.3; // rad, total fan width
// Quick claws: they clear the screen in about half a second, which both reads
// as automatic fire and keeps the live count down (a slower claw lingers, and
// lingering views are what cost frames).
export const TALON_SPEED = 950; // px/s
export const TALON_DMG = 5; // per claw — heavier now that there are fewer
export const TALON_BURST_TIME = 2.6; // s the barrage keeps firing
// Cadence. Peak concurrency is set by this and the claw's flight time, NOT by
// the burst length. At 4 claws every 0.2s the barrage tops out near TWENTY-FOUR
// live claw views, down from ~49. Dropping this lower stacks views faster than
// they clear and starts costing frames again — it multiplies against
// TALON_COUNT, so it is the dominant lever. Guarded in constants.test.ts.
export const TALON_BURST_EVERY = 0.2;
// Widened with the claw count — see the rebalance note above. This is what
// stops four claws reading as a thinner fan instead of the same rake.
export const TALON_SWEEP_AMP = 0.22; // rad the fan swings either side of centre
export const TALON_SWEEP_FREQ = 5.5; // rad/s of that swing
// Talons/spears restyle the ship's own bolt rather than shipping new art:
// stretched long and thin, they read as a claw and a lance instead of a bolt.
// Drawn at a fixed length × thickness (NOT the source aspect) — the distortion
// is the point.
export const TALON_LEN = 78; // along travel
export const TALON_THICK = 34; // widened with the claw count — see above
// A talon is a big raking claw, not a pinpoint bolt. Its hit test is padded so
// a fast diagonal sweep can't step clean over a hitbox between two frames (at
// the 0.05s dt cap a talon covers 38px, close to a 36px enemy box).
export const TALON_PAD = 18;

// Nova — NOVA BURST: the star goes off. A shockwave ring expands from the hull,
// damaging every enemy it crosses (once each) and wiping the enemy fire it
// sweeps. The top-tier hull's ultimate: it's the only special that clears
// incoming shots, which makes it the one you can also panic-press to survive a
// screen you'd otherwise die on — worth more than raw damage.
export const NOVA_SPEED = 880; // px/s the ring expands
export const NOVA_RADIUS = 640; // px reach before it dissipates
export const NOVA_DMG = 14;
// The ring is drawn ONCE at this diameter and then SCALED on the native side.
// Sizing a view to the live radius instead makes it grow past 1200px, and a
// rounded border that big can't be drawn in hardware — Android re-rasterizes a
// multi-megabyte software layer every frame, which is what made the burst
// stutter. A fixed-size view the GPU stretches costs nothing per frame.
export const NOVA_RING_BASE = 256; // px diameter of the unscaled ring
// Stroke at scale 1. The scale carries it up with the ring (×5 at full reach),
// so the wave starts as a thin hot hoop and broadens as it disperses.
export const NOVA_THICK = 2.5;
// The detonation whites out the whole screen. This is one flat full-screen
// quad at an animated opacity — no rounded edges, nothing to re-rasterize —
// so the biggest part of the effect is also the cheapest thing on screen.
export const NOVA_FLASH_COLOR = PALETTE.goldHi; // warm, not a clinical strobe
export const NOVA_FLASH_ALPHA = 0.72; // peak whiteout
// Expansion distance the flash decays over. Well short of NOVA_RADIUS: the
// blaze has to be gone in ~0.25s or it stops reading as a blast and starts
// reading as fog sitting over the gameplay.
export const NOVA_FLASH_R = 240;
// The fireball at the heart of it: a filled disc riding inside the ring at this
// fraction of its radius, gone about as fast as the flash, so it stays a small
// bright core rather than growing into a screen-covering blob.
export const NOVA_CORE_FRAC = 0.55;
export const NOVA_CORE_COLOR = PALETTE.goldHi;
export const NOVA_CORE_ALPHA = 0.6;
export const NOVA_CORE_R = 224; // expansion distance the core fades over

// Valkyrie — SPEAR RAIN: judgment from above. Spears of light fall down the
// screen, one aimed at each enemy, piercing everything in their column. The
// widest reach of any special — it covers the whole board, not just what's
// ahead — but purely offensive, which is why it sits under the Nova.
//
// --- Rebalanced: fewer, heavier spears --------------------------------------
//
// This was 30 spears at 8 damage. Unlike the talons, which clear the screen in
// half a second, a spear falls the WHOLE height of the board — so the whole
// rain is alive simultaneously and thirty views is the floor, not the peak. It
// was the single most expensive moment in the game and it showed on device.
//
// Sixteen spears at 15 damage is exactly the same total (240), so the ability
// hits precisely as hard as it always did against a stacked column — it just
// costs the renderer 47% less. Coverage survives the cut because the spears
// aimed at enemy COLUMNS are allocated first and the random scatter is only the
// filler after them (see fireSpecial): at sixteen there is still a spear for
// every distinct column on the board, which is the part that has to be
// reliable. SPEAR_THICK is up to keep the curtain reading as dense.
export const SPEAR_COUNT = 16; // spears in one rain
export const SPEAR_SPEED = 940; // px/s downward, before the per-spear variance
export const SPEAR_DMG = 15; // heavier now that there are fewer
export const SPEAR_LEN = 92; // stretched long — a lance, not a bolt
export const SPEAR_THICK = 30; // widened with the spear count — see above
// The rain is deliberately MESSY: every spear rolls its own launch height, fall
// speed and lean, so they arrive scattered instead of sweeping down as one tidy
// rank of parallel rails. Only the spears aimed at enemy columns keep an exact
// x — the rest scatter — so the chaos never costs the ability its reliability.
export const SPEAR_DROP_BAND = 900; // px above the screen the launches scatter through
// The rain launches in waves rather than as one sheet. Creating every sprite on
// the activation frame — which is already carrying the hit-stop, two sounds and
// a heavy haptic — was a spike on top of a spike. Spread over a fifth of a
// second it also reads better: a downpour building instead of a single curtain.
// Every spear still launches from above the screen, so nothing about the timing
// is visible as a delay.
export const SPEAR_RELEASE = 4; // spears launched per release
export const SPEAR_RELEASE_EVERY = 0.04; // s between releases → 16 in ~0.16s
export const SPEAR_SPEED_VAR = 0.35; // ± fraction of random fall-speed variation
// Radians of random lean off vertical. Small on purpose: at the 0.05s frame cap
// the fastest spear already covers 63px against a 92px swept body, and a steeper
// lean would start letting tips slip past a hitbox between frames.
export const SPEAR_TILT = 0.2;

export interface SpecialDef {
  name: string; // shouted on the HUD when it fires, and listed in the shop
  desc: string; // one-line shop blurb: what the coins actually buy
}

export const SPECIALS: Record<SpecialKind, SpecialDef> = {
  bulwark: { name: 'BULWARK', desc: 'A hard shell eats every shot — and fires each one back.' },
  phantom: { name: 'PHANTOMS', desc: 'Two ghost wingmen fade in and fire beside you.' },
  talons: { name: 'TALONS', desc: 'A machine-gun rake of piercing claws, sprayed wide.' },
  nova: { name: 'NOVA BURST', desc: 'A shockwave ring that blasts and clears enemy fire.' },
  spears: { name: 'SPEAR RAIN', desc: 'A spear of light drops onto every enemy on screen.' },
};

// Ironclad — BULWARK: a shell snaps around the hull, absorbs everything it is
// hit by, and throws each absorbed shot back as your own. Teaches the FIRE
// button, teaches that enemy fire is *material*, and rewards flying INTO danger
// — which is exactly the behaviour the graze system pays for.
export const BULWARK_TIME = 4; // s the shell holds
export const BULWARK_TIME_OVER = 6.5; // s when fired overcharged
export const BULWARK_RING = 96; // rendered diameter
export const BULWARK_COLOR = PALETTE.plasma;
export const BULWARK_CORE = 'rgba(53,214,255,0.16)';
// Damage of a reflected shot. Generous — the fantasy is turning a bullet wall
// into your own volley — but capped per activation so a spiraller can't hand
// the player a hundred free shots.
export const BULWARK_REFLECT_DMG = 3;
export const BULWARK_REFLECT_MAX = 24; // reflected shots per activation
export const BULWARK_REFLECT_SPEED = 780;

// --- Avatars: unlockable with coins ---
export interface AvatarDef {
  id: string;
  name: string;
  price: number; // in coins
  /** require()'d local asset. Required — every hull ships art, and the emoji
   *  fallback this replaced was a dead branch carrying the last emoji in the app. */
  image: number;
  shot: ShotArt; // the ship's signature fire-shot art
  special: SpecialKind; // its FIRE-button ultimate — the reason to buy it
}

// Each hull fires its own signature bolt: one silhouette (Lasers Bullets #3,
// "Laser Bullet 5", all 63×165) in five of the pack's own hues, so your hull's
// colour is your fire. The art points UP, the direction the shot flies, so the
// renderer draws it unrotated — `aspect` is width/height, and PLAYER_SHOT_LEN
// is its drawn height.
//
// These are verbatim copies of the pack's colour folders — nothing is
// recoloured here, in the art or at runtime. The per-hull `// pack N` comment
// records which folder each came from, so the choice stays auditable and a hull
// can be re-hued by copying a different folder rather than by editing pixels.
// `tint` is UI only (shop tier edge, special label); it never touches the sprite.
//
// Every hue is on the cool half of the wheel or gold. That is the friend/foe
// rule, not a style choice: the crimson bolts belong to the enemy, so a red
// player shot would read as incoming fire. Raptor's red and Valkyrie's magenta
// were exactly that bug, and are now violet and ice blue. See palette.test.ts,
// which fails if a hull ever picks up a hostile hue again.
//
// Each hull also carries a special named after itself, and they get stronger
// (and wider-reaching) with price.
export const AVATARS: AvatarDef[] = [
  {
    id: 'ironclad', name: 'Ironclad', price: 0,
    image: require('../../assets/avatars/pship1.png'),
    shot: { src: require('../../assets/bullets/pshot1.png'), aspect: 63 / 165, tint: PALETTE.plasma }, // pack 9, cyan #1BD2EB
    special: 'bulwark', // armour, not tricks — so its ultimate is a shell
  },
  {
    id: 'specter', name: 'Specter', price: 60,
    image: require('../../assets/avatars/pship2.png'),
    shot: { src: require('../../assets/bullets/pshot2.png'), aspect: 63 / 165, tint: '#3DE0C0' }, // pack 8, teal #18E7B9
    special: 'phantom', // a specter haunts: ghosts of itself fly alongside
  },
  {
    id: 'raptor', name: 'Raptor', price: 150,
    image: require('../../assets/avatars/pship3.png'),
    shot: { src: require('../../assets/bullets/pshot3.png'), aspect: 63 / 165, tint: PALETTE.violet }, // pack 13, purple #A242F4
    special: 'talons', // a raptor strikes with its claws
  },
  {
    id: 'valkyrie', name: 'Valkyrie', price: 300,
    image: require('../../assets/avatars/pship5.png'),
    shot: { src: require('../../assets/bullets/pshot5.png'), aspect: 63 / 165, tint: '#5BB0FF' }, // pack 10, blue #319AF1
    special: 'spears', // a valkyrie descends from the sky, spear in hand
  },
  {
    id: 'nova', name: 'Nova', price: 500,
    image: require('../../assets/avatars/pship4.png'),
    shot: { src: require('../../assets/bullets/pshot4.png'), aspect: 63 / 165, tint: PALETTE.gold }, // pack 4, yellow #E3D313
    special: 'nova', // a nova is a star detonating — so it detonates
  },
];
