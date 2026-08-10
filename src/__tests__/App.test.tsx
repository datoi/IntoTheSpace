import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import App from '../../App';
import { freshRunState } from '../game/runstate';
import { GameState } from '../game/types';
import { AVATAR_Y, OB_HIT, DECODE_GRACE_MS, MIN_LOADING_MS, FONT_GRACE_MS } from '../game/constants';

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
  await advance(DECODE_GRACE_MS + MIN_LOADING_MS + FONT_GRACE_MS + 10);
};

// A resumable snapshot one hit away from death, with an enemy parked on top
// of the player, so continuing ends the run within a few frames.
const doomedRun = (): GameState => ({
  ...freshRunState(),
  alt: 4321.4,
  wave: 2,
  waveClearTimer: 999,
  fireTimer: 999,
  giftTimer: 999,
  heartTimer: 999,
  coinTimer: 999,
  boonTimer: 999,
  enemyFireTimer: 999,
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
  elapsed: 60,
  hearts: 1,
  coins: 6,
  // A banked score, so this run sets a score record the way a real one would.
  score: 5000,
  bestMult: 4,
  grazes: 18,
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
    expect(screen.queryByText('LIFT OFF')).toBeNull();
  });

  it('releases the gate even when no sprite ever reports a decode', async () => {
    // Jest has no native image stack, so onLoad never fires — only the grace
    // window can release the gate. If it could not, boot would hang forever.
    await bootApp();
    expect(screen.getByText('LIFT OFF')).toBeTruthy();
    expect(screen.queryByText(/PREPARING LAUNCH/)).toBeNull();
  });

  it('holds the menu back until the minimum loading time has passed', async () => {
    await render(<App />);
    await advance(MIN_LOADING_MS - 50);
    expect(screen.queryByText('LIFT OFF')).toBeNull();
  });
});

describe('App — menu & navigation', () => {
  it('boots to the menu with the stored save', async () => {
    await AsyncStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ best: 777, likes: 33, unlocked: ['ironclad'], selectedAvatar: 'ironclad' })
    );
    await bootApp();
    // Best depth is still shown, but 'BEST' now prefixes the best SCORE.
    // Depth moved to the game-over breakdown; the menu leads with the wallet.
    expect(screen.getByText('33')).toBeTruthy();
  });

  it('navigates menu → shop → menu', async () => {
    await bootApp();
    await fireEvent.press(screen.getByText('SHOP'));
    expect(screen.getByText(/coins/)).toBeTruthy();
    await fireEvent.press(screen.getByText('BACK'));
    expect(screen.getByText('LIFT OFF')).toBeTruthy();
  });

  it('starts a fresh game from the menu', async () => {
    await bootApp();
    await fireEvent.press(screen.getByText('LIFT OFF'));
    expect(screen.getByTestId('pause')).toBeTruthy(); // in-game pause button
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
    await fireEvent.press(screen.getByText('SHOP'));
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
    await fireEvent.press(screen.getByText('SHOP'));
    await fireEvent.press(screen.getByText('Nova')); // the dearest hull: 500 > 200
    expect(screen.getByText('200 coins')).toBeTruthy(); // unchanged
    const stored = JSON.parse((await AsyncStorage.getItem(SAVE_KEY))!);
    expect(stored?.unlocked ?? ['ironclad']).not.toContain('nova');
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
    await fireEvent.press(screen.getByText('SHOP'));
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

    await fireEvent.press(screen.getByText('LIFT OFF'));
    expect(screen.getByText('PAUSED')).toBeTruthy(); // resumed runs open paused

    await fireEvent.press(screen.getByText('CONTINUE'));
    await advance(300); // the parked enemy takes the last heart

    // Game over screen with this run's distance, a new best (4321 > 1000).
    expect(screen.getByText('ROCKET DOWN')).toBeTruthy();
    // Altitude is now a breakdown row ('4321m · best 4321m'), not the headline.
    expect(screen.getByText(/432[0-9]m/)).toBeTruthy();
    expect(screen.getByText('NEW BEST')).toBeTruthy();

    await advance(10);
    // Save banked: best updated, wallet += the run's 6 coins. Snapshot cleared.
    const stored = JSON.parse((await AsyncStorage.getItem(SAVE_KEY))!);
    expect(stored.best).toBeGreaterThanOrEqual(4321);
    expect(stored.stats.bestScore).toBe(5000);
    expect(stored.stats.grazes).toBe(18);
    expect(stored.likes).toBe(16);
    expect(await AsyncStorage.getItem(RUN_KEY)).toBeNull();
  });

  it('LAUNCH AGAIN after game over starts a live (unpaused) fresh run', async () => {
    await AsyncStorage.setItem(RUN_KEY, JSON.stringify(doomedRun()));
    await bootApp();
    await fireEvent.press(screen.getByText('LIFT OFF'));
    await fireEvent.press(screen.getByText('CONTINUE'));
    await advance(300);
    expect(screen.getByText('ROCKET DOWN')).toBeTruthy();

    await fireEvent.press(screen.getByText('LAUNCH AGAIN'));
    expect(screen.getByTestId('pause')).toBeTruthy();
    expect(screen.queryByText('PAUSED')).toBeNull(); // stale snapshot must not resurrect
    // Score and coins both start at a bare 0, so count rather than match one.
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2);
  });

  it('pausing home from a run keeps the snapshot so the menu can resume it', async () => {
    await bootApp();
    await fireEvent.press(screen.getByText('LIFT OFF'));
    await advance(200); // play a few frames
    await fireEvent.press(screen.getByTestId('pause'));
    await fireEvent.press(screen.getByText('RETURN TO HOME'));
    expect(screen.getByText('LIFT OFF')).toBeTruthy();
    await advance(10);
    const run = JSON.parse((await AsyncStorage.getItem(RUN_KEY))!);
    expect(run).not.toBeNull();
    expect(run.alt).toBeGreaterThan(0);

    // Lifting off again resumes that run (opens paused at the same altitude).
    await fireEvent.press(screen.getByText('LIFT OFF'));
    expect(screen.getByText('PAUSED')).toBeTruthy();
  });
});

describe('App — backgrounds economy', () => {
  beforeEach(async () => {
    await AsyncStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        best: 100,
        likes: 200,
        unlocked: ['ironclad'],
        selectedAvatar: 'ironclad',
        unlockedBackgrounds: ['violet'],
        selectedBackground: 'violet',
      })
    );
  });

  it('switching between owned backgrounds does not crash the ambient sky', async () => {
    // The reported crash: changing background threw a forEach-of-null out of
    // Animated, because the menu sky rebuilt its interpolation node graph on
    // every render while the native driver still held the old nodes. The sky is
    // now keyed by background id, so a switch is a clean unmount/remount.
    //
    // NOTE: jest-expo stubs the native animated driver, so this exercises the
    // mount/unmount path but cannot reproduce the native teardown itself — the
    // definitive check is on device.
    await AsyncStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        best: 100,
        likes: 900,
        unlocked: ['ironclad'],
        selectedAvatar: 'ironclad',
        unlockedBackgrounds: ['violet', 'void', 'azure', 'quartz'],
        selectedBackground: 'violet',
      })
    );
    await bootApp();
    await fireEvent.press(screen.getByText('SHOP'));
    await fireEvent.press(screen.getByText('BACKGROUNDS'));
    // Cycle through several, then back to the first — each swaps the sky.
    for (const name of ['Deep Void', 'Azure Drift', 'Rose Quartz', 'Violet Veil', 'Deep Void']) {
      await fireEvent.press(screen.getByText(name));
      await advance(20);
      expect(screen.getByText('BACKGROUNDS')).toBeTruthy();
    }
    // …and back out to the menu, which mounts the sky again.
    await fireEvent.press(screen.getByText('BACK'));
    expect(screen.getByText('LIFT OFF')).toBeTruthy();
  });

  it('buying a background deducts coins, unlocks, equips, and persists', async () => {
    await bootApp();
    await fireEvent.press(screen.getByText('SHOP'));
    await fireEvent.press(screen.getByText('BACKGROUNDS'));
    await fireEvent.press(screen.getByText('Deep Void')); // costs 90
    expect(screen.getByText('110 coins')).toBeTruthy();
    expect(screen.getByText('EQUIPPED')).toBeTruthy();
    await advance(10);
    const stored = JSON.parse((await AsyncStorage.getItem(SAVE_KEY))!);
    expect(stored.likes).toBe(110);
    expect(stored.unlockedBackgrounds).toContain('void');
    expect(stored.selectedBackground).toBe('void');
  });

  it('cannot buy a background it cannot afford', async () => {
    await bootApp();
    await fireEvent.press(screen.getByText('SHOP'));
    await fireEvent.press(screen.getByText('BACKGROUNDS'));
    await fireEvent.press(screen.getByText('Crimson Cloud')); // 450 > 200
    expect(screen.getByText('200 coins')).toBeTruthy();
    await advance(10);
    const stored = JSON.parse((await AsyncStorage.getItem(SAVE_KEY))!);
    expect(stored.unlockedBackgrounds ?? ['violet']).not.toContain('crimson');
  });

  it('equipping an owned background persists the selection without cost', async () => {
    await AsyncStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        best: 100,
        likes: 200,
        unlocked: ['ironclad'],
        selectedAvatar: 'ironclad',
        unlockedBackgrounds: ['violet', 'void'],
        selectedBackground: 'violet',
      })
    );
    await bootApp();
    await fireEvent.press(screen.getByText('SHOP'));
    await fireEvent.press(screen.getByText('BACKGROUNDS'));
    await fireEvent.press(screen.getByText('Deep Void'));
    await advance(10);
    const stored = JSON.parse((await AsyncStorage.getItem(SAVE_KEY))!);
    expect(stored.selectedBackground).toBe('void');
    expect(stored.likes).toBe(200);
  });
});

describe('App — remaining navigation & boot paths', () => {
  it('Back to menu from the game over screen', async () => {
    await AsyncStorage.setItem(RUN_KEY, JSON.stringify(doomedRun()));
    await bootApp();
    await fireEvent.press(screen.getByText('LIFT OFF'));
    await fireEvent.press(screen.getByText('CONTINUE'));
    await advance(300);
    expect(screen.getByText('ROCKET DOWN')).toBeTruthy();
    await fireEvent.press(screen.getByText('BACK TO MENU'));
    expect(screen.getByText('LIFT OFF')).toBeTruthy();
  });

  it('sprite decode releases the boot gate before the grace timer', async () => {
    await render(<App />);
    // Let storage + preload resolve and the minimum-time gate pass, but stay
    // well short of DECODE_GRACE_MS.
    await advance(MIN_LOADING_MS + 10);
    expect(screen.queryByText('LIFT OFF')).toBeNull();

    // Every prewarmed sprite reports painted — the decode signal, not the
    // grace timer, must open the gate.
    const fireLoads = () => {
      const walk = (node: any) => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'Image') node.props.onLoad?.();
        (node.children ?? []).forEach(walk);
      };
      walk(screen.toJSON());
    };
    await act(async () => fireLoads());
    expect(screen.getByText('LIFT OFF')).toBeTruthy();
  });
});
