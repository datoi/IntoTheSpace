/**
 * Phase 1 mechanics running in the live loop.
 *
 * chain.test.ts pins the maths; this proves GameScreen actually reads it — that
 * grazing a bullet keeps a chain alive, that a hit collapses it to ×1 rather
 * than zero, that Bulwark eats fire and throws it back, and that energy is
 * earned rather than handed over.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import GameScreen from '../GameScreen';
import { freshRunState } from '../../game/runstate';
import { BASE_SHIP_STATS } from '../../game/upgrades';
import { GameState, Card, EnemyBullet } from '../../game/types';
import { CHAIN_STEP, CHAIN_WINDOW, GRAZE_PAD } from '../../game/chain';
import {
  laneX,
  AVATAR_Y,
  AVATAR_SIZE,
  OB_HIT,
  ENEMY_SHIPS,
  BACKGROUNDS,
  AVATARS,
  ENERGY_OVERCHARGE,
  BULWARK_TIME,
} from '../../game/constants';

/** Firing a special freezes the sim briefly; clear that before asserting. */
const HITSTOP_MS = 220;

const quietState = (over: Partial<GameState> = {}): GameState => ({
  ...freshRunState(),
  wave: 1,
  waveClearTimer: 999,
  fireTimer: 999,
  giftTimer: 999,
  heartTimer: 999,
  coinTimer: 999,
  boonTimer: 999,
  enemyFireTimer: 999,
  cards: [],
  nextId: 4000,
  ...over,
});

let nextId = 1;
const card = (over: Partial<Card>): Card => ({
  id: nextId++,
  kind: 'rage',
  lane: 1,
  y: 200,
  h: OB_HIT,
  emoji: '',
  hp: 1,
  maxHp: 1,
  hitT: 0,
  shipIdx: 0,
  dead: false,
  deadT: 0,
  nearMissChecked: false,
  ...over,
});

const bullet = (over: Partial<EnemyBullet>): EnemyBullet => ({
  id: nextId++,
  x: 100,
  y: 200,
  vx: 0,
  vy: 0,
  kind: 'straight',
  color: '#FF3B3B',
  size: 10,
  phase: 0,
  life: 20,
  ...over,
});

const renderGame = async (resume?: GameState, extra: Record<string, unknown> = {}) => {
  const onGameOver = jest.fn();
  const onPersist = jest.fn();
  await render(
    <GameScreen
      best={0}
      avatarImage={AVATARS[0].levels[0]}
      avatarShot={AVATARS[0].shot}
      avatarSpecial={AVATARS[0].special}
      shipStats={BASE_SHIP_STATS}
      background={BACKGROUNDS[0].set}
      resume={resume ?? null}
      onGameOver={onGameOver}
      onPersist={onPersist}
      onClearRun={jest.fn()}
      onHome={jest.fn()}
      {...extra}
    />
  );
  return { onGameOver, onPersist };
};

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

/** Pause and read the live run state — the most precise probe available. */
const snapshot = async (onPersist: jest.Mock): Promise<GameState> => {
  await fireEvent.press(screen.getByTestId('pause'));
  return onPersist.mock.calls[0][0];
};

const countImages = (source: unknown): number => {
  let n = 0;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Image' && node.props?.source === source) n++;
    (node.children ?? []).forEach(walk);
  };
  walk(screen.toJSON());
  return n;
};

/** A row of 1-HP enemies stacked in the player's lane, fed to the auto-guns. */
const feeder = (count: number): Card[] =>
  Array.from({ length: count }, (_, i) =>
    card({ lane: 1, y: AVATAR_Y - 120 - i * 10, hp: 1, maxHp: 1 })
  );

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('score replaces the clock', () => {
  it('flying without killing anything scores nothing', async () => {
    // The old score was altitude, which ticked up whether or not the player did
    // anything. Idling must now be worth zero.
    const { onPersist } = await renderGame(quietState());
    await advance(3000);
    const snap = await snapshot(onPersist);
    expect(snap.alt).toBeGreaterThan(0); // still climbing…
    expect(snap.score).toBe(0); // …but that is not a score
  });

  it('kills are what put points on the board', async () => {
    const { onPersist } = await renderGame(quietState({ fireTimer: 0, cards: feeder(4) }));
    await advance(2500);
    const snap = await snapshot(onPersist);
    expect(snap.kills).toBeGreaterThan(0);
    expect(snap.score).toBeGreaterThan(0);
  });

  it('a longer chain is worth more per kill than a broken one', async () => {
    const { onPersist } = await renderGame(quietState({ fireTimer: 0, cards: feeder(12) }));
    await advance(6000);
    const snap = await snapshot(onPersist);
    // With a chain running, average score per kill must exceed the flat base
    // value of 10 that an unchained kill pays.
    expect(snap.kills).toBeGreaterThanOrEqual(CHAIN_STEP);
    expect(snap.score / snap.kills).toBeGreaterThan(10);
  });
});

describe('graze', () => {
  /** A bullet parked in the graze band beside the hull, going nowhere. */
  const grazingShot = () =>
    bullet({
      x: laneX(1),
      // Just above the player's box, inside the pad but not touching.
      y: AVATAR_Y + 6 - GRAZE_PAD * 0.5,
      vx: 0,
      vy: 0,
    });

  it('a near miss counts, and costs no heart', async () => {
    const { onPersist } = await renderGame(quietState({ enemyBullets: [grazingShot()] }));
    await advance(300);
    const snap = await snapshot(onPersist);
    expect(snap.grazes).toBeGreaterThan(0);
    expect(snap.hitsTaken).toBe(0);
  });

  it('pays only once per bullet, however long it lingers', async () => {
    // Without the latch a shot sitting alongside the hull would pay every frame.
    const { onPersist } = await renderGame(quietState({ enemyBullets: [grazingShot()] }));
    await advance(2000);
    const snap = await snapshot(onPersist);
    expect(snap.grazes).toBe(1);
  });

  it('a bullet that actually connects is a hit, not a graze', async () => {
    const { onPersist } = await renderGame(
      quietState({
        enemyBullets: [bullet({ x: laneX(1), y: AVATAR_Y + AVATAR_SIZE / 2, vx: 0, vy: 0 })],
      })
    );
    await advance(300);
    const snap = await snapshot(onPersist);
    expect(snap.hitsTaken).toBe(1);
    expect(snap.grazes).toBe(0);
  });

  it('grazing keeps a chain alive that would otherwise have decayed', async () => {
    // The chain window is CHAIN_WINDOW; a stream of grazes past that point must
    // hold it open. This is the mechanic that makes flying toward fire correct.
    const shots = Array.from({ length: 40 }, (_, i) =>
      bullet({
        x: laneX(1) - 60 + i * 3,
        y: AVATAR_Y + 6 - GRAZE_PAD * 0.5,
        vx: 40,
        vy: 0,
      })
    );
    const resume = quietState({
      chain: 10,
      chainT: 0.2, // about to lapse
      enemyBullets: shots,
    });
    const { onPersist } = await renderGame(resume);
    await advance(Math.round(CHAIN_WINDOW * 1000));
    const snap = await snapshot(onPersist);
    expect(snap.grazes).toBeGreaterThan(0);
    // Held at 10 — no kill happened, so grazes alone kept it from decaying.
    expect(snap.chain).toBe(10);
  });

  it('grazes feed the special meter', async () => {
    const { onPersist } = await renderGame(quietState({ enemyBullets: [grazingShot()] }));
    await advance(200);
    const snap = await snapshot(onPersist);
    expect(snap.specialCharge).toBeGreaterThan(0);
  });
});

describe('taking a hit', () => {
  it('collapses the chain to ×1 rather than to zero', async () => {
    const resume = quietState({
      chain: 30,
      chainT: CHAIN_WINDOW,
      enemyBullets: [bullet({ x: laneX(1), y: AVATAR_Y + AVATAR_SIZE / 2 })],
    });
    const { onPersist } = await renderGame(resume);
    await advance(300);
    const snap = await snapshot(onPersist);
    expect(snap.hitsTaken).toBe(1);
    expect(snap.chain).toBe(0); // ×1
    // The run's record is kept for the results screen even so.
    expect(snap.bestMult).toBeGreaterThanOrEqual(1);
  });

  it('spoils the FULL CHAIN ribbon for the wave in progress', async () => {
    const resume = quietState({
      chain: 10,
      enemyBullets: [bullet({ x: laneX(1), y: AVATAR_Y + AVATAR_SIZE / 2 })],
    });
    const { onPersist } = await renderGame(resume);
    await advance(300);
    expect((await snapshot(onPersist)).waveChainHeld).toBe(false);
  });
});

describe('hit-stop', () => {
  it('freezes the simulation briefly on a kill', async () => {
    // Simulated time must fall behind wall clock, because frames spent frozen
    // advance nothing.
    const idle = await renderGame(quietState());
    await advance(1000);
    const idleElapsed = (await snapshot(idle.onPersist)).elapsed;

    const killing = await renderGame(quietState({ fireTimer: 0, cards: feeder(6) }));
    await advance(1000);
    const killElapsed = (await snapshot(killing.onPersist)).elapsed;

    expect(killElapsed).toBeLessThan(idleElapsed);
  });

  it('a mass kill does not compound into a long stall', async () => {
    // Ordinary kills don't re-trigger a freeze that is already running —
    // otherwise a screen-clearing Nova would play as a stutter.
    const swarm = Array.from({ length: 12 }, (_, i) =>
      card({ lane: i % 5, y: AVATAR_Y - 130 - Math.floor(i / 5) * 40, hp: 1, maxHp: 1 })
    );
    const { onPersist } = await renderGame(
      quietState({ specialCharge: 1, cards: swarm }),
      { avatarSpecial: 'nova' }
    );
    await advance(60);
    await fireEvent.press(screen.getByText('FIRE'));
    await advance(HITSTOP_MS + 600);
    const snap = await snapshot(onPersist);
    expect(snap.kills).toBeGreaterThan(6); // the ring did sweep the formation
    expect(snap.hitStop).toBeLessThanOrEqual(0.3); // and never stacked up
  });
});

describe('earned energy and overcharge', () => {
  it('banks past full when the player keeps playing well', async () => {
    const { onPersist } = await renderGame(
      quietState({ specialCharge: ENERGY_OVERCHARGE - 0.02, cards: feeder(3), fireTimer: 0 })
    );
    await advance(1500);
    const snap = await snapshot(onPersist);
    expect(snap.specialCharge).toBe(ENERGY_OVERCHARGE);
  });

  it('never banks beyond the overcharge ceiling', async () => {
    const { onPersist } = await renderGame(
      quietState({ specialCharge: ENERGY_OVERCHARGE, cards: feeder(8), fireTimer: 0 })
    );
    await advance(3000);
    expect((await snapshot(onPersist)).specialCharge).toBe(ENERGY_OVERCHARGE);
  });

  it('an overcharged firing spends the whole meter', async () => {
    const { onPersist } = await renderGame(
      quietState({ specialCharge: ENERGY_OVERCHARGE }),
      { avatarSpecial: 'nova' }
    );
    await advance(60);
    await fireEvent.press(screen.getByText('FIRE'));
    await advance(HITSTOP_MS + 60);
    expect((await snapshot(onPersist)).specialCharge).toBeLessThan(0.2);
  });
});

describe('Ironclad — BULWARK', () => {
  const armedIronclad = (over: Partial<GameState> = {}) =>
    quietState({ specialCharge: 1, ...over });

  it('the starter hull can fire a special at all', async () => {
    const { onPersist } = await renderGame(armedIronclad());
    await advance(60);
    await fireEvent.press(screen.getByText('FIRE'));
    await advance(HITSTOP_MS + 60);
    const snap = await snapshot(onPersist);
    expect(snap.specialsUsed).toBe(1);
    expect(snap.bulwarkTime).toBeGreaterThan(0);
  });

  it('absorbs a shot that would otherwise have cost a heart', async () => {
    const resume = armedIronclad({
      enemyBullets: [bullet({ x: laneX(1), y: AVATAR_Y - 120, vx: 0, vy: 260 })],
    });
    const { onPersist } = await renderGame(resume);
    await advance(60);
    await fireEvent.press(screen.getByText('FIRE'));
    await advance(HITSTOP_MS + 700); // long enough for the shot to arrive
    const snap = await snapshot(onPersist);
    expect(snap.hitsTaken).toBe(0);
  });

  it('throws each absorbed shot back as a player bullet', async () => {
    const incoming = Array.from({ length: 5 }, (_, i) =>
      bullet({ x: laneX(1), y: AVATAR_Y - 100 - i * 14, vx: 0, vy: 300 })
    );
    const resume = armedIronclad({ enemyBullets: incoming });
    const { onPersist } = await renderGame(resume);
    await advance(60);
    await fireEvent.press(screen.getByText('FIRE'));
    await advance(HITSTOP_MS + 500);
    const snap = await snapshot(onPersist);
    // The reflect budget was spent, which only happens on absorb.
    expect(snap.bulwarkLeft).toBeLessThan(24);
    expect(snap.hitsTaken).toBe(0);
  });

  it('the reflected fire can kill', async () => {
    const resume = armedIronclad({
      cards: [card({ lane: 1, y: AVATAR_Y - 220, hp: 2, maxHp: 2 })],
      enemyBullets: Array.from({ length: 4 }, (_, i) =>
        bullet({ x: laneX(1), y: AVATAR_Y - 60 - i * 12, vx: 0, vy: 300 })
      ),
    });
    const { onPersist } = await renderGame(resume);
    await advance(60);
    await fireEvent.press(screen.getByText('FIRE'));
    await advance(HITSTOP_MS + 900);
    const snap = await snapshot(onPersist);
    expect(snap.kills).toBeGreaterThan(0);
    expect(countImages(ENEMY_SHIPS[0])).toBe(0);
  });

  it('the shell expires on its own timer', async () => {
    const { onPersist } = await renderGame(armedIronclad());
    await advance(60);
    await fireEvent.press(screen.getByText('FIRE'));
    await advance(HITSTOP_MS + BULWARK_TIME * 1000 + 400);
    expect((await snapshot(onPersist)).bulwarkTime).toBe(0);
  });
});

describe('wave-clear ribbons', () => {
  it('awards FLAWLESS and pays it into the score', async () => {
    // One enemy left in the wave, killed without ever being hit.
    const resume = quietState({
      wave: 1,
      waveClearTimer: 0.2,
      waveStartT: 0,
      fireTimer: 0,
      cards: [card({ lane: 1, y: AVATAR_Y - 150, hp: 1, maxHp: 1 })],
    });
    const { onPersist } = await renderGame(resume);
    await advance(1600);
    const snap = await snapshot(onPersist);
    expect(snap.flawlessWaves).toBeGreaterThan(0);
    // Score exceeds what the single kill alone could pay.
    expect(snap.score).toBeGreaterThan(100);
  });
});
