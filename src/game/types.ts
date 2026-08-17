import type { ArchKind, EliteKind } from './enemies';
import type { ActiveBoons, BoonKind } from './pickups';
import type { StatDelta } from './progression';

// 'boon' is the utility-pickup track (shields, magnets, boosts — see
// pickups.ts). Guns stay on their own 'gift' track so the gun-stacking
// mechanic is untouched by it.
export type CardKind = 'rage' | 'heart' | 'gift' | 'coin' | 'boon';

export type GunKind = 'single' | 'double' | 'bomb' | 'laser' | 'homing';

// A ship's signature ultimate, fired from the FIRE button once its meter fills.
// Every ship but the free starter has one, so buying a hull buys a new way to
// play and not just a repaint. Each is named off the ship that carries it.
// Every hull has one, including the free starter. It used to have 'none' — a
// permanently dead button — which taught a new player "you don't have the good
// stuff" in their first minute instead of teaching them the verb. Ironclad now
// gets a defensive special matching its armour identity.
export type SpecialKind =
  | 'bulwark' // Ironclad: a hard shell that eats fire and throws it back
  | 'phantom' // Specter: spectral copies of your hull fire alongside you
  | 'talons' // Raptor: a bird-of-prey rake of piercing claws
  | 'nova' // Nova: the star goes off — an expanding shockwave ring
  | 'spears'; // Valkyrie: judgment from above, a rain of light spears

export interface Card {
  id: number;
  kind: CardKind;
  lane: number;
  y: number; // hitbox top edge
  h: number; // hitbox height (visual is drawn slightly larger, centered)
  emoji: string; // enemies evolve with altitude (😡 → 👿 → 👾)
  hp: number; // bullets left to destroy it (pickups are not shootable)
  maxHp: number;
  hitT: number; // seconds of bullet-hit flash remaining
  holdY?: number; // formation hold position for wave enemies (undefined = falls)
  shipIdx?: number; // enemy ship art tier (index into ENEMY_SHIPS; missing = 0)
  boss?: 'mini' | 'giant'; // boss waves: a single big shooty monster
  /**
   * The phase index this boss was last seen in.
   *
   * The phase ITSELF is derived from health every frame (see bosses.ts), so
   * this exists only to spot the transition and fire the feedback for it once.
   * Absent on a card from an older save, in which case the first frame after a
   * resume adopts whatever phase the boss is already in SILENTLY — a resume is
   * not a transition, and announcing one the player never crossed would be a
   * lie about what just happened.
   */
  bossPhaseSeen?: number;
  gun?: GunKind; // 'gift' drops: which gun it grants, decided at spawn so the
  // pickup can show that gun's own art instead of a mystery box
  w?: number; // hitbox width override (bosses; others derive from kind)
  /**
   * Bosses: the sway sine's accumulated PHASE, in radians.
   *
   * Integrated per frame rather than derived from run time. The phase table
   * scales sway SPEED, and a multiplier applied to absolute time jumps the
   * sine's argument by `t × Δmult` the instant health crosses a band — a
   * discontinuity that GROWS with fight length, and which teleported a giant up
   * to 79% of the screen sideways on its last transition. Integrating a rate
   * cannot do that: changing the rate changes where the phase goes next, never
   * where it already is.
   *
   * Starting at 0 also means a boss opens its sway at screen centre, which is
   * what stops it snapping sideways the frame it stops descending.
   */
  swayPhase?: number;
  /** Bosses: current sway width, eased toward the phase's target. */
  swayAmp?: number;
  charging?: boolean; // wave 20+: a wounded enemy dives at the player
  cx?: number; // free x while charging (otherwise laneX(lane))
  dead: boolean; // collected or resolved (kept briefly for pop animation)
  deadT: number; // seconds since resolved
  nearMissChecked: boolean;

  // --- Utility pickups (kind === 'boon') ---
  boon?: BoonKind; // which effect this drop grants, decided at spawn so the
  // badge can show its own glyph before you commit to the grab

  // --- Enemy archetype & elite state (kind === 'rage') ---
  // All optional: a card without them behaves exactly as the original single
  // enemy type did, which is what lets an older save resume safely.
  arch?: ArchKind; // behaviour template (movement + fire pattern)
  elite?: EliteKind; // optional modifier layered on top
  homeX?: number; // formation anchor the movement behaviours orbit/sway around
  /**
   * Latched the frame this enemy first reaches its formation slot.
   *
   * Without it, "am I in position?" was re-derived every frame as `y < holdY` —
   * which is false for any behaviour that moves ABOVE the slot. An orbiting
   * Sentinel spends half its cycle up there, so it flipped between its orbit
   * and the descent clamp on alternate frames and juddered in place.
   */
  arrived?: boolean;
  behaveT?: number; // per-enemy behaviour clock (desynchronised at spawn)
  fireEvery?: number; // this enemy's own shot interval, after elite scaling
  fireT?: number; // seconds until its next shot
  speedMult?: number; // movement/descent scaling (Swift elites)
  dir?: number; // strafe direction, -1 or 1
  blinkT?: number; // teleporter: seconds to the next jump
  blinkFlash?: number; // teleporter: seconds of arrival flash left
  spiralA?: number; // spinner: current fan angle
  windup?: number; // sniper: seconds of visible charge remaining
  shieldHp?: number; // Shielded elite: pool that must break before the hull
  shieldMax?: number;
  regenIdle?: number; // Regenerating elite: seconds since it was last hit
  splitsLeft?: number; // splitter: children still owed on death
}

export interface Bullet {
  id: number;
  x: number;
  y: number;
  dmg: number;
  // 'talon' (Raptor) and 'spear' (Valkyrie) come from ship specials: the talon
  // rakes outward on a free heading, the spear falls DOWN the screen — the only
  // player shot that does, so culling is direction-aware.
  kind: 'normal' | 'bomb' | 'laser' | 'rocket' | 'talon' | 'spear';
  phase?: number; // zigzag offset for homing rockets
  targetId?: number; // enemy a homing rocket is locked onto
  hits?: number[]; // enemies a piercing shot (laser / talon / spear) has already damaged
  angle?: number; // rocket heading (deg) so its sprite faces where it flies
  vx?: number; // talons only: free heading, so they fan out instead of flying up
  vy?: number;
  crit?: boolean; // rolled at fire time — colours the hit feedback
  speed?: number; // per-shot travel speed (upgraded rails fire faster bullets);
  // absent on shots from an older snapshot, which fall back to BULLET_SPEED
}

// A shot fired by an enemy back down at the player (Galaxy-Attack style).
export interface EnemyBullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: 'straight' | 'zigzag' | 'homing'; // escalates with wave
  color: string; // per-wave color
  size: number; // diameter
  phase: number; // zigzag offset
  life: number; // seconds before it fizzles (bounds homing shots)
  shot?: number; // index into ENEMY_SHOTS, set from the shooter's archetype (undefined = plain dot)
  ownerId?: number; // the enemy that fired it, so a Vampiric elite can heal on a
  // landed hit (looked up by id — the owner may already be dead, in which case
  // the heal simply doesn't happen)
  /** Already grazed — a bullet pays its graze once, not once per frame. */
  grazed?: boolean;
  /** Frames of white flick left after a graze, so the near-miss is visible. */
  grazeFlash?: number;
  // --- Cached render geometry -------------------------------------------------
  // Derived from the fields above, kept on the bullet so the RENDER can read
  // them instead of recomputing them. The render runs for every live shot every
  // frame, so an atan2 and an object allocation there cost ~100× more than the
  // same work done once at spawn.
  //
  // All three are maintained by the update loop and self-heal if absent, so a
  // run resumed from a snapshot written before these existed still draws
  // correctly on its first frame.
  /** Sprite heading in DEGREES. Only a homing shot's changes after spawn. */
  angle?: number;
  /** Cached sprite box — `size` never changes, so neither do these. */
  bw?: number;
  bh?: number;
}

/** A one-shot sprite animation played where an enemy died. */
export interface Explosion {
  id: number;
  x: number;
  y: number;
  /** Seconds since it started; the frame is derived from this. */
  t: number;
  /** Index into EXPLOSIONS — the dead hull's colour family. */
  style: number;
  /** Drawn size, so a boss fireball dwarfs a drone's pop. */
  size: number;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // seconds remaining
  color: string;
  size: number;
}

export interface FloatText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

// The full run state. Serializable (plain arrays/objects) so an in-progress
// run can be snapshotted to storage and resumed after the app is closed.
export interface GameState {
  avatarX: number; // avatar center x
  avatarY: number; // avatar top edge
  targetX: number; // where the finger is dragging the avatar to
  targetY: number;
  dragDX: number; // grab offset: avatar position minus finger at grab time
  dragDY: number;
  dragging: boolean;
  alt: number; // meters climbed
  wave: number; // current wave number (enemies come in cleared-then-harder waves)
  waveClearTimer: number; // delay before the next wave drops in
  gun: GunKind;
  gunTime: number; // seconds left on a gift gun
  gunLevel: number; // stacks when the same gun gift is re-collected (parallel shots)
  fireTimer: number;
  // --- Ship special (the FIRE button) ---
  // 0..ENERGY_OVERCHARGE. Earned from kills, grazes and clears rather than
  // handed over on a timer; past 1.0 it is banked toward an enhanced firing.
  specialCharge: number;
  bulwarkTime: number; // Ironclad: seconds of shell left
  bulwarkLeft: number; // reflected shots still available this activation
  /**
   * Hits the SHIELD BOON can still absorb before it shatters (see SHIELD_HITS).
   *
   * Separate from the boon's own countdown in `boons.shield`: the shield ends on
   * whichever runs out first, time or hits. Shattering deletes the boon, so
   * "shield active with zero budget" never occurs in play — a resumed run in
   * that state is a snapshot from before the budget existed.
   */
  shieldLeft: number;
  phantomTime: number; // Specter: seconds of ghost wingmen left
  talonTime: number; // Raptor: seconds of claw barrage left
  talonTimer: number; // Raptor: seconds until the next fan in that barrage
  novaR: number; // Nova: current shockwave radius in px (0 = no wave out)
  novaX: number; // where the wave went off (it stays put; the ship flies on)
  novaY: number;
  novaHits: number[]; // enemies this wave has already damaged (it hits each once)
  // --- Staggered spawns ---------------------------------------------------
  // Two moments used to create their whole population on ONE frame: a boss
  // paying out fourteen coins, and Valkyrie launching thirty spears. Mounting
  // that many views in a single frame is far more expensive than moving them
  // afterwards, and both landed on the frame that was already the busiest in
  // the game — which is exactly where the remaining hitch was coming from.
  // They're queued here instead and released a few at a time. The rain reads
  // better for it, too: a downpour building rather than a single sheet.
  coinQueue: { cx: number; y: number }[]; // boss payout still to spawn
  coinQueueT: number; // seconds until the next few are released
  spearQueue: number[]; // Valkyrie: x columns still to launch
  spearQueueT: number;
  giftTimer: number;
  heartTimer: number; // seconds until the next ❤️ drop
  coinTimer: number; // seconds until the next coin drop
  enemyFireTimer: number;
  bullets: Bullet[];
  enemyBullets: EnemyBullet[];
  cards: Card[];
  particles: Particle[];
  /** Live death animations. Not persisted — purely cosmetic and short-lived. */
  explosions: Explosion[];
  floats: FloatText[];
  elapsed: number;
  distTimer: number;
  hearts: number; // lives left — every hit costs one
  maxHearts: number; // this run's ceiling (raised by the Extra Heart boon)
  coins: number; // collected this run; banked to the shop wallet on game over
  shake: number; // seconds of screen shake remaining
  hitFlash: number; // seconds of red vignette remaining
  nextId: number;

  // --- Utility pickups ---
  boons: ActiveBoons; // kind → seconds remaining (see pickups.ts)
  boonTimer: number; // seconds until the next boon drops

  // --- Bombs: carried, and set off by the player's own button ---
  bombs: number;
  bombCap: number; // capacity, from the hull's Bomb Bay upgrade
  bombFlash: number; // seconds of detonation whiteout remaining

  // --- Deep currencies banked this run (spent on late upgrade levels) ---
  crystals: number;
  chips: number;
  alloy: number;

  // --- Per-run stat accumulation, folded into lifetime stats on game over ---
  kills: number;
  eliteKills: number;
  miniBossKills: number;
  giantBossKills: number;
  damageDealt: number;
  shotsFired: number;
  shotsHit: number;
  pickupsCollected: number;
  heartsCollected: number;
  bombsUsed: number;
  specialsUsed: number;
  hitsTaken: number;
  /** Bosses killed this run without the player losing a heart since it spawned. */
  perfectBosses: number;
  /** Hearts lost since the current boss appeared — drives `perfectBosses`. */
  bossDamageTaken: number;
  /** Hearts lost during the wave currently in progress. */
  waveHits: number;
  /** Waves cleared this run without taking a hit. */
  flawlessWaves: number;

  // --- The Chain: the run's real score (see chain.ts) ---
  score: number;
  chain: number;
  chainT: number; // seconds left on the chain window
  decayT: number; // seconds accumulated toward shedding the next step
  bestMult: number; // highest multiplier reached, for the results screen
  grazes: number;
  /** Elapsed time when the current wave spawned — drives the SPEED ribbon. */
  waveStartT: number;
  /** False once the chain has broken during this wave — drives FULL CHAIN. */
  waveChainHeld: boolean;

  /** Seconds of frozen simulation remaining (hit-stop). */
  hitStop: number;
}

export type GamePhase = 'menu' | 'playing' | 'gameover' | 'shop' | 'hangar' | 'stats' | 'quests';

export interface RunResult {
  coins: number; // collected this run
  /**
   * The run's score — kills × the chain multiplier, plus ribbons and grazes.
   * This is what measures how well the run was played; altitude below is the
   * depth reached, kept as a separate readout (and as the historical `best`).
   */
  score: number;
  /** Highest chain multiplier reached, for the results breakdown. */
  bestMult: number;
  grazes: number;
  altitude: number; // metres climbed — depth/pace, not a measure of skill
  crystals: number;
  chips: number;
  alloy: number;
  wave: number; // deepest wave reached
  /** Counters this run contributed, folded into lifetime stats on game over. */
  stats: StatDelta;
}
