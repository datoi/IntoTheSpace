import { PRELOAD_SPRITES, PRELOAD_MODULES, preloadAssets } from '../preload';
import {
  AVATARS,
  ENEMY_SHIPS,
  ENEMY_SHOTS,
  BG_SETS,
  ENEMY_SHIP_VIS,
  EXPLOSIONS,
  EXPLOSION_FRAMES,
  EXPLOSION_FOR_SHIP,
  EXPLOSION_BOSS,
  EXPLOSION_BOSS_SCALE,
  EXPLOSION_VIS,
  explosionForShip,
  PRELOAD_TIMEOUT_MS,
} from '../constants';

describe('preload — the sprite warm list', () => {
  it('covers every avatar, enemy tier, boss and projectile', () => {
    const sources = PRELOAD_SPRITES.map((s) => s.src);
    for (const img of AVATARS.map((a) => a.image).filter((i) => i != null)) {
      expect(sources).toContain(img);
    }
    for (const ship of ENEMY_SHIPS) expect(sources).toContain(ship);
    for (const shot of ENEMY_SHOTS) expect(sources).toContain(shot);
    for (const a of AVATARS) expect(sources).toContain(a.shot.src);
    // Every explosion frame: a death animation steps ten sources in half a
    // second, so a cold decode mid-burst would tear a hole in the effect.
    for (const style of EXPLOSIONS) for (const frame of style) expect(sources).toContain(frame);
    // avatar images + ships + 2 bosses + 3 gun shots + avatar shots
    // + enemy shots + every explosion frame + the boss style warmed AGAIN at
    // the larger size a boss draws it (see below)
    expect(PRELOAD_SPRITES.length).toBe(
      AVATARS.length +
        ENEMY_SHIPS.length +
        2 +
        3 +
        AVATARS.length +
        ENEMY_SHOTS.length +
        EXPLOSIONS.length * EXPLOSION_FRAMES +
        EXPLOSION_FRAMES
    );
  });

  it('warms the boss fireball at the size a boss actually draws it', () => {
    // Warming a bitmap at one size does not warm it at another, and the boss
    // fireball is EXPLOSION_BOSS_SCALE× the ordinary one — so without this entry
    // all ten frames of the biggest explosion in the game decode cold, on the
    // frame a boss dies. Every other explosion is warmed only at EXPLOSION_VIS.
    const bossSize = EXPLOSION_VIS * EXPLOSION_BOSS_SCALE;
    for (const frame of EXPLOSIONS[EXPLOSION_BOSS]) {
      const sizes = PRELOAD_SPRITES.filter((s) => s.src === frame).map((s) => s.w);
      expect(sizes).toContain(EXPLOSION_VIS);
      expect(sizes).toContain(bossSize);
    }
  });

  it('gives every hull sprite an explosion style to die in', () => {
    expect(EXPLOSION_FOR_SHIP).toHaveLength(ENEMY_SHIPS.length);
    for (let i = 0; i < ENEMY_SHIPS.length; i++) {
      const style = explosionForShip(i);
      expect(EXPLOSIONS[style]).toBeDefined();
      expect(EXPLOSIONS[style]).toHaveLength(EXPLOSION_FRAMES);
    }
    // The boss fireball is reserved — no ordinary hull dies in it, so the big
    // kill never looks like a large version of a small one.
    for (let i = 0; i < ENEMY_SHIPS.length; i++) {
      expect(explosionForShip(i)).not.toBe(EXPLOSION_BOSS);
    }
  });

  it('clamps an out-of-range hull index instead of returning undefined art', () => {
    // Older snapshots can carry a shipIdx from a shorter cast.
    expect(EXPLOSIONS[explosionForShip(999)]).toBeDefined();
    expect(EXPLOSIONS[explosionForShip(-1)]).toBeDefined();
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
