import { PRELOAD_SPRITES, PRELOAD_MODULES, preloadAssets } from '../preload';
import {
  AVATARS,
  ENEMY_SHIPS,
  ENEMY_SHOTS,
  BG_SETS,
  ENEMY_SHIP_VIS,
  EXPLOSION_SHEETS,
  EXPLOSION_FRAMES,
  EXPLOSION_FOR_SHIP,
  EXPLOSION_BOSS,
  EXPLOSION_BOSS_SCALE,
  EXPLOSION_VIS,
  SHIP_LEVELS,
  explosionForShip,
  PRELOAD_TIMEOUT_MS,
} from '../constants';

describe('preload — the sprite warm list', () => {
  it('covers every avatar, enemy tier, boss and projectile', () => {
    const sources = PRELOAD_SPRITES.map((s) => s.src);
    // Every build level of every hull: a hull swaps sprite when investment
    // crosses a tier threshold, and a level that was never warmed decodes cold
    // in the Hangar with the ship on screen.
    for (const img of AVATARS.flatMap((a) => a.levels)) {
      expect(sources).toContain(img);
    }
    for (const ship of ENEMY_SHIPS) expect(sources).toContain(ship);
    for (const shot of ENEMY_SHOTS) expect(sources).toContain(shot);
    for (const a of AVATARS) expect(sources).toContain(a.shot.src);
    // Every explosion sheet. One sheet holds a whole style, so warming it
    // warms all EXPLOSION_FRAMES at once and no decode can land mid-burst.
    for (const sheet of EXPLOSION_SHEETS) expect(sources).toContain(sheet);
    // every hull x every build level + enemy ships + 2 bosses + 3 gun shots
    // + avatar shots + enemy shots + one sheet per style + the boss sheet
    // warmed AGAIN at the larger size a boss draws it (see below)
    expect(PRELOAD_SPRITES.length).toBe(
      AVATARS.length * SHIP_LEVELS +
        ENEMY_SHIPS.length +
        2 +
        3 +
        AVATARS.length +
        ENEMY_SHOTS.length +
        EXPLOSION_SHEETS.length +
        1
    );
  });

  it('warms the boss fireball at the size a boss actually draws it', () => {
    // Warming a bitmap at one size does not warm it at another, and the boss
    // fireball is EXPLOSION_BOSS_SCALE× the ordinary one — so without this entry
    // all ten frames of the biggest explosion in the game decode cold, on the
    // frame a boss dies. Every other explosion is warmed only at EXPLOSION_VIS.
    // Sheets are warmed at their DRAWN width, which is a whole strip.
    const sheet = EXPLOSION_SHEETS[EXPLOSION_BOSS];
    const sizes = PRELOAD_SPRITES.filter((s) => s.src === sheet).map((s) => s.w);
    expect(sizes).toContain(EXPLOSION_VIS * EXPLOSION_FRAMES);
    expect(sizes).toContain(EXPLOSION_VIS * EXPLOSION_BOSS_SCALE * EXPLOSION_FRAMES);
  });

  it('gives every hull sprite an explosion style to die in', () => {
    expect(EXPLOSION_FOR_SHIP).toHaveLength(ENEMY_SHIPS.length);
    for (let i = 0; i < ENEMY_SHIPS.length; i++) {
      const style = explosionForShip(i);
      expect(EXPLOSION_SHEETS[style]).toBeDefined();
    }
    // The boss fireball is reserved — no ordinary hull dies in it, so the big
    // kill never looks like a large version of a small one.
    for (let i = 0; i < ENEMY_SHIPS.length; i++) {
      expect(explosionForShip(i)).not.toBe(EXPLOSION_BOSS);
    }
  });

  it('clamps an out-of-range hull index instead of returning undefined art', () => {
    // Older snapshots can carry a shipIdx from a shorter cast.
    expect(EXPLOSION_SHEETS[explosionForShip(999)]).toBeDefined();
    expect(EXPLOSION_SHEETS[explosionForShip(-1)]).toBeDefined();
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

describe('explosion sheet geometry', () => {
  // The renderer slices a sheet by translating it in whole frame-widths: frame
  // N sits at x = N * (width / EXPLOSION_FRAMES). Nothing at runtime can detect
  // a sheet that was packed with a different frame count — the animation just
  // drifts sideways and shows slivers of two frames at once. So the packing is
  // verified against the real files here.
  const { readFileSync, readdirSync } = require('fs');
  const { join } = require('path');
  const DIR = join(__dirname, '..', '..', '..', 'assets', 'effects');

  /** Width/height straight out of the PNG IHDR chunk. */
  const png = (file: string) => {
    const b = readFileSync(join(DIR, file));
    expect(b.toString('ascii', 12, 16)).toBe('IHDR'); // a real PNG, not a stub
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  };

  const sheets = readdirSync(DIR).filter((f: string) => f.endsWith('.png'));

  it('ships one sheet per explosion style and nothing else', () => {
    expect(sheets).toHaveLength(EXPLOSION_SHEETS.length);
  });

  it('packs exactly EXPLOSION_FRAMES square frames into every sheet', () => {
    for (const file of sheets) {
      const { w, h } = png(file);
      // Square frames, so the strip is frames × height wide. An off-by-one in
      // the pack shows up here rather than as a visual drift on device.
      expect(w).toBe(h * EXPLOSION_FRAMES);
      expect(w % EXPLOSION_FRAMES).toBe(0);
    }
  });

  it('packs every sheet identically, so one style cannot drift from another', () => {
    const dims = sheets.map((f: string) => JSON.stringify(png(f)));
    expect(new Set(dims).size).toBe(1);
  });
});
