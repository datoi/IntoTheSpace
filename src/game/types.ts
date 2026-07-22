export type CardKind = 'rage' | 'heart' | 'gift' | 'coin';

export type GunKind = 'single' | 'double' | 'bomb' | 'laser' | 'homing';

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
  gun?: GunKind; // 'gift' drops: which gun it grants, decided at spawn so the
  // pickup can show that gun's own art instead of a mystery box
  w?: number; // hitbox width override (bosses; others derive from kind)
  swayT0?: number; // bosses: elapsed time when the sway began, so it starts
  // centered on the descent point instead of mid-swing
  charging?: boolean; // wave 20+: a wounded enemy dives at the player
  cx?: number; // free x while charging (otherwise laneX(lane))
  dead: boolean; // collected or resolved (kept briefly for pop animation)
  deadT: number; // seconds since resolved
  nearMissChecked: boolean;
}

export interface Bullet {
  id: number;
  x: number;
  y: number;
  dmg: number;
  kind: 'normal' | 'bomb' | 'laser' | 'rocket';
  phase?: number; // zigzag offset for homing rockets
  targetId?: number; // enemy a homing rocket is locked onto
  hits?: number[]; // enemies a piercing laser has already damaged
  angle?: number; // rocket heading (deg) so its sprite faces where it flies
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
  shipIdx?: number; // shooter's ship tier — selects a laser-shot sprite (0/undefined = plain dot)
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
  giftTimer: number;
  heartTimer: number; // seconds until the next ❤️ drop
  coinTimer: number; // seconds until the next coin drop
  enemyFireTimer: number;
  bullets: Bullet[];
  enemyBullets: EnemyBullet[];
  cards: Card[];
  particles: Particle[];
  floats: FloatText[];
  elapsed: number;
  distTimer: number;
  hearts: number; // lives left — every hit costs one
  coins: number; // collected this run; banked to the shop wallet on game over
  shake: number; // seconds of screen shake remaining
  hitFlash: number; // seconds of red vignette remaining
  nextId: number;
}

export type GamePhase = 'menu' | 'playing' | 'gameover' | 'shop';

export interface RunResult {
  coins: number; // collected this run
  altitude: number; // meters climbed before the hull gave out — the only score
}
