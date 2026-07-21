import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import App from '../../App';
import { GameState } from '../game/types';
import { laneX, AVATAR_Y, OB_HIT, DECODE_GRACE_MS, MIN_LOADING_MS } from '../game/constants';

const SAVE_KEY = 'doomscroll:save:v1';
const RUN_KEY = 'doomscroll:run:v4';

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

// Render App and run out the boot gate: storage read, asset preload, and the
// decode grace window (no native image stack under Jest, so onLoad never
// fires and the grace timer is what releases the gate).
const bootApp = async () => {
  await render(<App />);
  await advance(DECODE_GRACE_MS + MIN_LOADING_MS + 10);
};

// A resumable snapshot one hit away from death, with an enemy parked on top
// of the player, so continuing ends the run within a few frames.
const doomedRun = (): GameState => ({
  avatarX: laneX(1),
  avatarY: AVATAR_Y,
  targetX: laneX(1),
  targetY: AVATAR_Y,
  dragDX: 0,
  dragDY: 0,
  dragging: false,
  alt: 4321.4,
  wave: 2,
  bgIdx: 0,
  bgFade: 0,
  bgTier: 0,
  waveClearTimer: 999,
  gun: 'single',
  gunTime: 0,
  gunLevel: 1,
  fireTimer: 999,
  giftTimer: 999,
  heartTimer: 999,
  coinTimer: 999,
  enemyFireTimer: 999,
  bullets: [],
  enemyBullets: [],
  cards: [
    {
      id: 1,
      kind: 'rage',
      lane: 1,
      y: AVATAR_Y + 10,
      h: OB_HIT,
      emoji: '',
      hp: 5,
      maxHp: 5,
      hitT: 0,
      shipIdx: 0,
      dead: false,
      deadT: 0,
      nearMissChecked: false,
    },
  ],
  particles: [],
  floats: [],
  elapsed: 60,
  distTimer: 0,
  hearts: 1,
  coins: 6,
  shake: 0,
  hitFlash: 0,
  nextId: 100,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('App — boot gate', () => {
  it('shows the loading screen instead of the menu until boot completes', async () => {
    await render(<App />);
    expect(screen.getByText(/PREPARING LAUNCH/)).toBeTruthy();
    expect(screen.queryByText('LIFT OFF 🚀')).toBeNull();
  });

  it('releases the gate even when no sprite ever reports a decode', async () => {
    // Jest has no native image stack, so onLoad never fires — only the grace
    // window can release the gate. If it could not, boot would hang forever.
    await bootApp();
    expect(screen.getByText('LIFT OFF 🚀')).toBeTruthy();
    expect(screen.queryByText(/PREPARING LAUNCH/)).toBeNull();
  });

  it('holds the menu back until the minimum loading time has passed', async () => {
    await render(<App />);
    await advance(MIN_LOADING_MS - 50);
    expect(screen.queryByText('LIFT OFF 🚀')).toBeNull();
  });
});

describe('App — menu & navigation', () => {
  it('boots to the menu with the stored save', async () => {
    await AsyncStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ best: 777, likes: 33, unlocked: ['ironclad'], selectedAvatar: 'ironclad' })
    );
    await bootApp();
    expect(screen.getByText(/BEST 777m/)).toBeTruthy();
    expect(screen.getByText('33')).toBeTruthy();
  });

  it('navigates menu → shop → menu', async () => {
    await bootApp();
    await fireEvent.press(screen.getByText('AVATARS'));
    expect(screen.getByText(/coins/)).toBeTruthy();
    await fireEvent.press(screen.getByText('BACK'));
    expect(screen.getByText('LIFT OFF 🚀')).toBeTruthy();
  });

  it('starts a fresh game from the menu', async () => {
    await bootApp();
    await fireEvent.press(screen.getByText('LIFT OFF 🚀'));
    expect(screen.getByText('❚❚')).toBeTruthy(); // in-game pause button
    expect(screen.queryByText('PAUSED')).toBeNull(); // fresh runs are live
  });
});

describe('App — shop economy', () => {
  beforeEach(async () => {
    await AsyncStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ best: 100, likes: 200, unlocked: ['ironclad'], selectedAvatar: 'ironclad' })
    );
  });

  it('buying an avatar deducts coins, unlocks, equips, and persists', async () => {
    await bootApp();
    await fireEvent.press(screen.getByText('AVATARS'));
    await fireEvent.press(screen.getByText('Specter')); // costs 60
    expect(screen.getByText('140 coins')).toBeTruthy();
    expect(screen.getByText('EQUIPPED')).toBeTruthy();
    await advance(10);
    const stored = JSON.parse((await AsyncStorage.getItem(SAVE_KEY))!);
    expect(stored.likes).toBe(140);
    expect(stored.unlocked).toContain('specter');
    expect(stored.selectedAvatar).toBe('specter');
  });

  it('cannot buy what it cannot afford', async () => {
    await bootApp();
    await fireEvent.press(screen.getByText('AVATARS'));
    await fireEvent.press(screen.getByText('Valkyrie')); // costs 500 > 200
    expect(screen.getByText('200 coins')).toBeTruthy(); // unchanged
    const stored = JSON.parse((await AsyncStorage.getItem(SAVE_KEY))!);
    expect(stored?.unlocked ?? ['ironclad']).not.toContain('valkyrie');
  });

  it('equipping an owned avatar persists the selection without cost', async () => {
    await AsyncStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        best: 100,
        likes: 200,
        unlocked: ['ironclad', 'specter'],
        selectedAvatar: 'ironclad',
      })
    );
    await bootApp();
    await fireEvent.press(screen.getByText('AVATARS'));
    await fireEvent.press(screen.getByText('Specter'));
    expect(screen.getByText('200 coins')).toBeTruthy();
    await advance(10);
    const stored = JSON.parse((await AsyncStorage.getItem(SAVE_KEY))!);
    expect(stored.selectedAvatar).toBe('specter');
    expect(stored.likes).toBe(200);
  });
});

describe('App — run lifecycle', () => {
  it('resumes a stored run on the pause screen, then game over banks the result', async () => {
    await AsyncStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ best: 1000, likes: 10, unlocked: ['ironclad'], selectedAvatar: 'ironclad' })
    );
    await AsyncStorage.setItem(RUN_KEY, JSON.stringify(doomedRun()));
    await bootApp();

    await fireEvent.press(screen.getByText('LIFT OFF 🚀'));
    expect(screen.getByText('PAUSED')).toBeTruthy(); // resumed runs open paused

    await fireEvent.press(screen.getByText('CONTINUE'));
    await advance(300); // the parked enemy takes the last heart

    // Game over screen with this run's distance, a new best (4321 > 1000).
    expect(screen.getByText('💥 ROCKET DOWN')).toBeTruthy();
    expect(screen.getByText(/^432[0-9]m$/)).toBeTruthy();
    expect(screen.getByText('NEW BEST')).toBeTruthy();

    await advance(10);
    // Save banked: best updated, wallet += the run's 6 coins. Snapshot cleared.
    const stored = JSON.parse((await AsyncStorage.getItem(SAVE_KEY))!);
    expect(stored.best).toBeGreaterThanOrEqual(4321);
    expect(stored.likes).toBe(16);
    expect(await AsyncStorage.getItem(RUN_KEY)).toBeNull();
  });

  it('LAUNCH AGAIN after game over starts a live (unpaused) fresh run', async () => {
    await AsyncStorage.setItem(RUN_KEY, JSON.stringify(doomedRun()));
    await bootApp();
    await fireEvent.press(screen.getByText('LIFT OFF 🚀'));
    await fireEvent.press(screen.getByText('CONTINUE'));
    await advance(300);
    expect(screen.getByText('💥 ROCKET DOWN')).toBeTruthy();

    await fireEvent.press(screen.getByText('LAUNCH AGAIN'));
    expect(screen.getByText('❚❚')).toBeTruthy();
    expect(screen.queryByText('PAUSED')).toBeNull(); // stale snapshot must not resurrect
    expect(screen.getByText('0')).toBeTruthy(); // fresh score
  });

  it('pausing home from a run keeps the snapshot so the menu can resume it', async () => {
    await bootApp();
    await fireEvent.press(screen.getByText('LIFT OFF 🚀'));
    await advance(200); // play a few frames
    await fireEvent.press(screen.getByText('❚❚'));
    await fireEvent.press(screen.getByText('RETURN TO HOME'));
    expect(screen.getByText('LIFT OFF 🚀')).toBeTruthy();
    await advance(10);
    const run = JSON.parse((await AsyncStorage.getItem(RUN_KEY))!);
    expect(run).not.toBeNull();
    expect(run.alt).toBeGreaterThan(0);

    // Lifting off again resumes that run (opens paused at the same altitude).
    await fireEvent.press(screen.getByText('LIFT OFF 🚀'));
    expect(screen.getByText('PAUSED')).toBeTruthy();
  });
});
