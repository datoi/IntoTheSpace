import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSave, writeSave, loadRun, saveRun, clearRun, DEFAULT_SAVE, SaveData } from '../storage';
import { GameState } from '../types';

const SAVE_KEY = 'doomscroll:save:v1';
const RUN_KEY = 'doomscroll:run:v3';

const sampleSave: SaveData = {
  best: 1234,
  likes: 42,
  unlocked: ['ironclad', 'specter'],
  selectedAvatar: 'specter',
};

// Minimal-but-complete run state; only fields storage cares about are shape-level.
const sampleRun = {
  avatarX: 100,
  avatarY: 500,
  targetX: 100,
  targetY: 500,
  dragDX: 0,
  dragDY: 0,
  dragging: false,
  alt: 999,
  wave: 3,
  bgIdx: 0,
  bgFade: 0,
  bgTier: 0,
  waveClearTimer: 1,
  gun: 'single',
  gunTime: 0,
  gunLevel: 1,
  fireTimer: 0,
  giftTimer: 5,
  heartTimer: 10,
  coinTimer: 4,
  enemyFireTimer: 1,
  bullets: [],
  enemyBullets: [],
  cards: [],
  particles: [],
  floats: [],
  elapsed: 12,
  distTimer: 0,
  hearts: 2,
  coins: 9,
  shake: 0,
  hitFlash: 0,
  nextId: 50,
} as GameState;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('loadSave', () => {
  it('returns defaults when nothing is stored', async () => {
    const save = await loadSave();
    expect(save).toEqual(DEFAULT_SAVE);
  });

  it('does not hand out a reference to DEFAULT_SAVE internals (mutation safety)', async () => {
    const a = await loadSave();
    a.unlocked.push('hacked');
    a.best = 999;
    const b = await loadSave();
    expect(b.unlocked).toEqual(['ironclad']);
    expect(b.best).toBe(0);
    expect(DEFAULT_SAVE.unlocked).toEqual(['ironclad']);
  });

  it('round-trips a save written by writeSave', async () => {
    await writeSave(sampleSave);
    expect(await loadSave()).toEqual(sampleSave);
  });

  it('returns defaults on corrupt JSON', async () => {
    await AsyncStorage.setItem(SAVE_KEY, '{not json!!');
    expect(await loadSave()).toEqual(DEFAULT_SAVE);
  });

  it('fills missing fields from defaults for partial saves (forward compat)', async () => {
    await AsyncStorage.setItem(SAVE_KEY, JSON.stringify({ best: 500 }));
    const save = await loadSave();
    expect(save.best).toBe(500);
    expect(save.likes).toBe(0);
    expect(save.unlocked).toEqual(['ironclad']);
    expect(save.selectedAvatar).toBe('ironclad');
  });

  it('restores the starter avatar when the stored unlocked list is empty', async () => {
    await AsyncStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ ...sampleSave, unlocked: [] })
    );
    const save = await loadSave();
    expect(save.unlocked).toEqual(['ironclad']);
  });

  it('returns defaults when AsyncStorage itself rejects', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    expect(await loadSave()).toEqual(DEFAULT_SAVE);
  });
});

describe('writeSave', () => {
  it('persists as JSON under the save key', async () => {
    await writeSave(sampleSave);
    const raw = await AsyncStorage.getItem(SAVE_KEY);
    expect(JSON.parse(raw!)).toEqual(sampleSave);
  });

  it('swallows storage failures (non-fatal)', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('full'));
    await expect(writeSave(sampleSave)).resolves.toBeUndefined();
  });
});

describe('run snapshots', () => {
  it('loadRun returns null when no run is stored', async () => {
    expect(await loadRun()).toBeNull();
  });

  it('round-trips a full game state through saveRun/loadRun', async () => {
    await saveRun(sampleRun);
    expect(await loadRun()).toEqual(sampleRun);
  });

  it('preserves nested entity arrays through the snapshot', async () => {
    const run: GameState = {
      ...sampleRun,
      bullets: [{ id: 1, x: 5, y: 6, dmg: 4, kind: 'laser', hits: [7, 8] }],
      cards: [
        {
          id: 2,
          kind: 'rage',
          lane: 3,
          y: 40,
          h: 36,
          emoji: '',
          hp: 4,
          maxHp: 5,
          hitT: 0,
          holdY: 150,
          shipIdx: 1,
          dead: false,
          deadT: 0,
          nearMissChecked: false,
        },
      ],
      enemyBullets: [
        {
          id: 3,
          x: 1,
          y: 2,
          vx: 0,
          vy: 100,
          kind: 'zigzag',
          color: '#FF0000',
          size: 11,
          phase: 0.5,
          life: 3,
          shipIdx: 0,
        },
      ],
    };
    await saveRun(run);
    const loaded = await loadRun();
    expect(loaded).toEqual(run);
  });

  it('loadRun returns null on corrupt JSON', async () => {
    await AsyncStorage.setItem(RUN_KEY, '<<<garbage');
    expect(await loadRun()).toBeNull();
  });

  it('clearRun removes the stored run', async () => {
    await saveRun(sampleRun);
    await clearRun();
    expect(await loadRun()).toBeNull();
    expect(await AsyncStorage.getItem(RUN_KEY)).toBeNull();
  });

  it('clearRun is a no-op when nothing is stored', async () => {
    await expect(clearRun()).resolves.toBeUndefined();
  });

  it('saveRun and clearRun swallow storage failures', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('full'));
    await expect(saveRun(sampleRun)).resolves.toBeUndefined();
    jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('io'));
    await expect(clearRun()).resolves.toBeUndefined();
  });

  it('does not clobber the profile save (separate keys)', async () => {
    await writeSave(sampleSave);
    await saveRun(sampleRun);
    await clearRun();
    expect(await loadSave()).toEqual(sampleSave);
  });

  it('last write wins when snapshots race (rapid pause/background)', async () => {
    const a = { ...sampleRun, coins: 1 };
    const b = { ...sampleRun, coins: 2 };
    await Promise.all([saveRun(a), saveRun(b)]);
    // AsyncStorage serializes ops in call order; the later call must win.
    expect((await loadRun())!.coins).toBe(2);
  });
});
