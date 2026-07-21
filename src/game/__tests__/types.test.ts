/**
 * types.ts is compile-time only, but it makes one runtime-testable promise:
 * GameState is "serializable (plain arrays/objects) so an in-progress run can
 * be snapshotted to storage and resumed". These tests pin that contract.
 */
import { GameState, Card, Bullet, EnemyBullet, RunResult } from '../types';

const card: Card = {
  id: 1,
  kind: 'rage',
  lane: 2,
  y: 100,
  h: 36,
  emoji: '',
  hp: 3,
  maxHp: 5,
  hitT: 0.1,
  holdY: 150,
  shipIdx: 2,
  boss: 'mini',
  w: 82,
  charging: false,
  cx: 180,
  dead: false,
  deadT: 0,
  nearMissChecked: false,
};

const bullet: Bullet = { id: 2, x: 10, y: 20, dmg: 4, kind: 'laser', hits: [1] };

const enemyBullet: EnemyBullet = {
  id: 3,
  x: 5,
  y: 6,
  vx: 10,
  vy: 200,
  kind: 'homing',
  color: '#FF3B3B',
  size: 11,
  phase: 1.2,
  life: 4.5,
  shipIdx: 1,
};

const state: GameState = {
  avatarX: 100,
  avatarY: 600,
  targetX: 100,
  targetY: 600,
  dragDX: 0,
  dragDY: 0,
  dragging: true,
  alt: 5000,
  wave: 7,
  bgIdx: 1,
  bgFade: 0.3,
  bgTier: 1,
  waveClearTimer: 1.1,
  gun: 'homing',
  gunTime: 8,
  gunLevel: 2,
  fireTimer: 0.1,
  giftTimer: 3,
  heartTimer: 12,
  coinTimer: 5,
  enemyFireTimer: 0.9,
  bullets: [bullet],
  enemyBullets: [enemyBullet],
  cards: [card],
  particles: [{ id: 4, x: 1, y: 2, vx: 3, vy: 4, life: 0.5, color: '#FFF000', size: 5 }],
  floats: [{ id: 5, x: 1, y: 2, text: '+10', color: '#FFD32A', life: 0.8 }],
  elapsed: 30,
  distTimer: 0.4,
  hearts: 2,
  coins: 12,
  shake: 0,
  hitFlash: 0,
  nextId: 99,
};

describe('GameState serializability contract', () => {
  it('survives a JSON round-trip unchanged (what saveRun/loadRun rely on)', () => {
    const roundTripped = JSON.parse(JSON.stringify(state)) as GameState;
    expect(roundTripped).toEqual(state);
  });

  it('optional fields absent from an older snapshot stay absent, not corrupted', () => {
    const minimalCard: Card = {
      id: 1,
      kind: 'gift',
      lane: 0,
      y: 0,
      h: 36,
      emoji: '🎁',
      hp: 1,
      maxHp: 1,
      hitT: 0,
      dead: false,
      deadT: 0,
      nearMissChecked: false,
    };
    const rt = JSON.parse(JSON.stringify(minimalCard)) as Card;
    expect(rt.holdY).toBeUndefined();
    expect(rt.boss).toBeUndefined();
    expect(rt.cx).toBeUndefined();
  });

  it('RunResult carries only plain numbers', () => {
    const r: RunResult = { coins: 2, altitude: 5 };
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});
