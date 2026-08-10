import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import App from '../../App';
import { DEFAULT_SAVE } from '../game/storage';
import { levelOf } from '../game/progression';
import { upgradeCost } from '../game/upgrades';
import { UpgradeKind } from '../game/progression';
import { DECODE_GRACE_MS, MIN_LOADING_MS, FONT_GRACE_MS } from '../game/constants';

/**
 * Two mutations landing in ONE event batch.
 *
 * Every save handler used to close over the rendered `save` and hand persist()
 * a whole rebuilt object. Two firing before React re-rendered — two fingers
 * landing together, or a fast tap pair — both read the same stale copy, so the
 * second silently overwrote the first: a purchase that was never applied and
 * never charged, with no feedback that anything had been dropped.
 *
 * These drive the real App through the real screens rather than unit-testing
 * the handlers, because the bug lived in the batching, not in the arithmetic.
 */

const SAVE_KEY = 'doomscroll:save:v1';

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

const bootApp = async () => {
  await render(<App />);
  await advance(DECODE_GRACE_MS + MIN_LOADING_MS + FONT_GRACE_MS + 10);
};

/** Coin price of the next level — upgradeCost returns a Price, not a number. */
const coinsFor = (kind: UpgradeKind, level: number) => upgradeCost(kind, level).coins ?? 0;

const readSave = async () => JSON.parse((await AsyncStorage.getItem(SAVE_KEY)) as string);

beforeEach(async () => {
  // Clear BEFORE installing fake timers — AsyncStorage's own promises never
  // settle once the clock is frozen, and boot then hangs on the storage read.
  await AsyncStorage.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('two purchases in one event batch', () => {
  const RICH = { ...DEFAULT_SAVE, likes: 100_000 };

  it('applies BOTH upgrades and charges for both', async () => {
    await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(RICH));
    await bootApp();

    await fireEvent.press(screen.getByText('HANGAR'));

    const ship = RICH.selectedAvatar;
    // upgradeCost returns a Price, and early levels are coins-only.
    const costDamage = coinsFor('damage', levelOf(RICH.upgrades, ship, 'damage'));
    const costFireRate = coinsFor('fireRate', levelOf(RICH.upgrades, ship, 'fireRate'));

    // One act() so both presses flush in the SAME batch — this is the whole
    // point. Pressed in separate acts they always worked.
    await act(async () => {
      fireEvent.press(screen.getByText(/Weapon Core/));
      fireEvent.press(screen.getByText(/Autoloader/));
    });

    const saved = await readSave();
    expect(levelOf(saved.upgrades, ship, 'damage')).toBe(1);
    expect(levelOf(saved.upgrades, ship, 'fireRate')).toBe(1);
    expect(saved.likes).toBe(RICH.likes - costDamage - costFireRate);
    expect(saved.stats.upgradesBought).toBe(2);
  });

  it('leaves the two levels independent — neither clobbers the other', async () => {
    await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(RICH));
    await bootApp();
    await fireEvent.press(screen.getByText('HANGAR'));

    // Three on one track, batched with one on another: the counter must not
    // lose an increment anywhere in the chain.
    await act(async () => {
      fireEvent.press(screen.getByText(/Weapon Core/));
      fireEvent.press(screen.getByText(/Weapon Core/));
      fireEvent.press(screen.getByText(/Weapon Core/));
      fireEvent.press(screen.getByText(/Autoloader/));
    });

    const saved = await readSave();
    expect(levelOf(saved.upgrades, RICH.selectedAvatar, 'damage')).toBe(3);
    expect(levelOf(saved.upgrades, RICH.selectedAvatar, 'fireRate')).toBe(1);
    expect(saved.stats.upgradesBought).toBe(4);
  });

  it('charges the ESCALATING price for each level in a batch, not the first one four times', async () => {
    await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(RICH));
    await bootApp();
    await fireEvent.press(screen.getByText('HANGAR'));

    const ship = RICH.selectedAvatar;
    const expected = [0, 1, 2].reduce((sum, lvl) => sum + coinsFor('damage', lvl), 0);

    await act(async () => {
      fireEvent.press(screen.getByText(/Weapon Core/));
      fireEvent.press(screen.getByText(/Weapon Core/));
      fireEvent.press(screen.getByText(/Weapon Core/));
    });

    const saved = await readSave();
    expect(levelOf(saved.upgrades, ship, 'damage')).toBe(3);
    // Reading a stale save would have charged level 0's price three times.
    expect(saved.likes).toBe(RICH.likes - expected);
  });

  it('still refuses a purchase the player cannot afford, mid-batch', async () => {
    // Enough for exactly one level. The second press in the batch must see the
    // spent wallet, not the pre-purchase one.
    const first = coinsFor('damage', 0);
    const poor = { ...DEFAULT_SAVE, likes: first };
    await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(poor));
    await bootApp();
    await fireEvent.press(screen.getByText('HANGAR'));

    await act(async () => {
      fireEvent.press(screen.getByText(/Weapon Core/));
      fireEvent.press(screen.getByText(/Weapon Core/));
    });

    const saved = await readSave();
    expect(levelOf(saved.upgrades, poor.selectedAvatar, 'damage')).toBe(1);
    expect(saved.likes).toBe(0);
    expect(saved.likes).toBeGreaterThanOrEqual(0); // never goes negative
  });
});
