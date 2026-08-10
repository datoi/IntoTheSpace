/**
 * types.ts is compile-time only, but it makes one runtime-testable promise:
 * GameState is "serializable (plain arrays/objects) so an in-progress run can
 * be snapshotted to storage and resumed". These tests pin that contract.
 */
import { GameState, Card, Bullet, EnemyBullet, RunResult } from '../types';
import { freshRunState } from '../runstate';

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
  shot: 1,
};

// freshRunState() is the canonical GameState; only the fields this test asserts
// on are overridden, so a schema addition can't break the serialization check.
const state: GameState = {
  ...freshRunState(),
  alt: 5000,
  wave: 7,
  gun: 'homing',
  gunTime: 8,
  gunLevel: 2,
  dragging: true,
  specialCharge: 0.5,
  cards: [card],
  bullets: [bullet],
  enemyBullets: [enemyBullet],
  hearts: 2,
  coins: 12,
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
    const r: RunResult = { coins: 2, score: 8400, bestMult: 5, grazes: 12, altitude: 5, crystals: 1, chips: 0, alloy: 0, wave: 4, stats: { kills: 3 } };
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});
