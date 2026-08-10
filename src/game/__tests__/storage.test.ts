import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSave, writeSave, loadRun, saveRun, clearRun, DEFAULT_SAVE, SaveData } from '../storage';
import { GameState } from '../types';
import { freshRunState } from '../runstate';
import { resolveShipStats } from '../upgrades';

const SAVE_KEY = 'doomscroll:save:v1';
// Must match storage.ts — if the versioned key there moves again, the
// corrupt-JSON and clearRun tests below silently stop testing anything.
const RUN_KEY = 'doomscroll:run:v4';

// Built on DEFAULT_SAVE so a field added to the schema doesn't break this
// fixture — the test cares about round-tripping, not about listing every key.
const sampleSave: SaveData = {
  ...DEFAULT_SAVE,
  best: 1234,
  likes: 42,
  unlocked: ['ironclad', 'specter'],
  selectedAvatar: 'specter',
  unlockedBackgrounds: ['violet', 'void'],
  selectedBackground: 'void',
};

// Minimal-but-complete run state; only fields storage cares about are shape-level.
// Same idea for the run snapshot: freshRunState() is the canonical shape, and
// only the handful of fields these tests assert on are overridden.
const sampleRun: GameState = { ...freshRunState(), alt: 999, wave: 3, hearts: 2, coins: 7 };

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
          shot: 0,
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

describe('loadRun — a bad snapshot must not brick the app', () => {
  // loadSave has always migrated and normalized; loadRun was a bare cast. The
  // asymmetry mattered for the OUTCOME rather than the odds: an explicit null
  // survives the `{ ...freshRunState(), ...resume }` merge in GameScreen (which
  // only backfills ABSENT keys), the loop then iterates it, and the throw
  // escapes render. The same snapshot is re-read every launch, so it is a boot
  // loop with no way out.
  const RUN_KEY = 'doomscroll:run:v4';

  it('drops a null collection so the fresh default survives the merge', async () => {
    // The exact payload from the QA report.
    await AsyncStorage.setItem(RUN_KEY, JSON.stringify({ hearts: 3, cards: null, bullets: null }));
    const run = await loadRun();
    expect(run).not.toBeNull();
    expect('cards' in (run as object)).toBe(false);
    expect('bullets' in (run as object)).toBe(false);
    // …and the field that was fine is kept.
    expect((run as { hearts: number }).hearts).toBe(3);
  });

  it('drops a collection stored as the wrong type', async () => {
    await AsyncStorage.setItem(
      RUN_KEY,
      JSON.stringify({ cards: 'nope', enemyBullets: 42, floats: {}, boons: [] })
    );
    const run = (await loadRun()) as unknown as Record<string, unknown>;
    for (const key of ['cards', 'enemyBullets', 'floats', 'boons']) {
      expect(key in run).toBe(false);
    }
  });

  it('keeps a genuinely valid snapshot untouched', async () => {
    const good = freshRunState(resolveShipStats({}, 'ironclad'));
    await AsyncStorage.setItem(RUN_KEY, JSON.stringify(good));
    const run = await loadRun();
    expect(run).toEqual(JSON.parse(JSON.stringify(good)));
  });

  it('discards a scalar payload rather than resuming into it', async () => {
    await AsyncStorage.setItem(RUN_KEY, '42');
    expect(await loadRun()).toBeNull();
  });

  it('discards unparseable JSON', async () => {
    await AsyncStorage.setItem(RUN_KEY, '{not json');
    expect(await loadRun()).toBeNull();
  });

  it('CLEARS a snapshot it had to reject, so the next launch is clean', async () => {
    // Without this the same bad payload is read and rejected on every boot.
    await AsyncStorage.setItem(RUN_KEY, '{not json');
    await loadRun();
    expect(await AsyncStorage.getItem(RUN_KEY)).toBeNull();
  });

  it('treats an array payload as garbage, not as an object', async () => {
    await AsyncStorage.setItem(RUN_KEY, JSON.stringify([1, 2, 3]));
    expect(await loadRun()).toBeNull();
  });
});
