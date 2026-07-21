import { PRELOAD_SPRITES, PRELOAD_MODULES, preloadAssets } from '../preload';
import {
  AVATARS,
  ENEMY_SHIPS,
  LASERSHOTS,
  BG_SETS,
  ENEMY_SHIP_VIS,
  PRELOAD_TIMEOUT_MS,
} from '../constants';

describe('preload — the sprite warm list', () => {
  it('covers every avatar, enemy tier, boss and projectile', () => {
    const sources = PRELOAD_SPRITES.map((s) => s.src);
    for (const img of AVATARS.map((a) => a.image).filter((i) => i != null)) {
      expect(sources).toContain(img);
    }
    for (const ship of ENEMY_SHIPS) expect(sources).toContain(ship);
    for (const shot of LASERSHOTS) expect(sources).toContain(shot);
    // avatars + 6 ships + 2 bosses + 3 player shots + 5 lasershots
    expect(PRELOAD_SPRITES.length).toBe(AVATARS.length + ENEMY_SHIPS.length + 2 + 3 + LASERSHOTS.length);
  });

  it('warms sprites at a real, positive render size', () => {
    for (const s of PRELOAD_SPRITES) {
      expect(s.w).toBeGreaterThan(0);
      expect(s.h).toBeGreaterThan(0);
    }
    const ship = PRELOAD_SPRITES.find((s) => s.src === ENEMY_SHIPS[0]);
    expect(ship).toMatchObject({ w: ENEMY_SHIP_VIS, h: ENEMY_SHIP_VIS });
  });

  it('excludes backgrounds from the mounted warm list to bound bitmap memory', () => {
    const sources = PRELOAD_SPRITES.map((s) => s.src);
    for (const set of BG_SETS) {
      for (const layer of set.layers) expect(sources).not.toContain(layer.src);
      if (set.base !== undefined) expect(sources).not.toContain(set.base);
    }
  });
});

describe('preload — the fetch list', () => {
  it('includes backgrounds as well as sprites, without duplicates', () => {
    for (const set of BG_SETS) {
      for (const layer of set.layers) expect(PRELOAD_MODULES).toContain(layer.src);
      if (set.base !== undefined) expect(PRELOAD_MODULES).toContain(set.base);
    }
    for (const ship of ENEMY_SHIPS) expect(PRELOAD_MODULES).toContain(ship);
    expect(new Set(PRELOAD_MODULES).size).toBe(PRELOAD_MODULES.length);
  });
});

describe('preloadAssets', () => {
  it('reports monotonic progress and completes', async () => {
    const seen: number[] = [];
    await preloadAssets((done, total) => {
      expect(total).toBe(PRELOAD_MODULES.length);
      seen.push(done);
    });
    expect(seen[0]).toBe(0);
    expect(seen[seen.length - 1]).toBe(PRELOAD_MODULES.length);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  });

  it('resolves without a progress callback', async () => {
    await expect(preloadAssets()).resolves.toBeUndefined();
  });

  it('survives an asset that fails to download', async () => {
    const { Asset } = require('expo-asset');
    const spy = jest
      .spyOn(Asset, 'fromModule')
      .mockReturnValue({ downloadAsync: () => Promise.reject(new Error('offline')) });
    await expect(preloadAssets()).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('gives up rather than blocking boot forever on a stalled fetch', async () => {
    jest.useFakeTimers();
    const { Asset } = require('expo-asset');
    const spy = jest.spyOn(Asset, 'fromModule').mockReturnValue({ downloadAsync: () => new Promise(() => {}) });
    const pending = preloadAssets();
    jest.advanceTimersByTime(PRELOAD_TIMEOUT_MS + 10);
    await expect(pending).resolves.toBeUndefined();
    spy.mockRestore();
    jest.useRealTimers();
  });
});
