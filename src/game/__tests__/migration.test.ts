/**
 * Save migration and validation.
 *
 * This is the highest-stakes code in the progression update: a bug here loses a
 * real player's progress. The tests therefore focus on the v1 payload an
 * existing install actually has on disk, and on the ways a save can be
 * malformed without the game being allowed to crash or zero someone's wallet.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SAVE_VERSION,
  DEFAULT_SAVE,
  loadSave,
  writeSave,
  migrateSave,
  normalizeSave,
  balanceOf,
  withBalance,
  affords,
  spend,
  earn,
  SaveData,
} from '../storage';
import { freshStats } from '../progression';

const SAVE_KEY = 'doomscroll:save:v1';
const BACKUP_KEY = 'doomscroll:save:backup';

/** Exactly what a pre-progression build wrote — no version, no new fields. */
const v1Payload = {
  best: 4200,
  likes: 365,
  unlocked: ['ironclad', 'specter', 'raptor'],
  selectedAvatar: 'raptor',
  unlockedBackgrounds: ['violet', 'void'],
  selectedBackground: 'void',
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('migrateSave', () => {
  it('treats a payload with no version as v1 and brings it to current', () => {
    const out = migrateSave({ ...v1Payload });
    expect(out.version).toBe(SAVE_VERSION);
  });

  it('preserves every v1 field through the migration', () => {
    const out = migrateSave({ ...v1Payload });
    expect(out.best).toBe(4200);
    expect(out.likes).toBe(365);
    expect(out.unlocked).toEqual(['ironclad', 'specter', 'raptor']);
    expect(out.selectedAvatar).toBe('raptor');
    expect(out.selectedBackground).toBe('void');
  });

  it('seeds the new fields empty rather than absent', () => {
    const out = migrateSave({ ...v1Payload });
    expect(out.crystals).toBe(0);
    expect(out.chips).toBe(0);
    expect(out.alloy).toBe(0);
    expect(out.upgrades).toEqual({});
  });

  it('credits a returning player one run so their stats screen is not blank', () => {
    const out = migrateSave({ ...v1Payload }) as { stats: { runs: number } };
    expect(out.stats.runs).toBe(1);
  });

  it('leaves a brand-new player at zero runs', () => {
    const out = migrateSave({ best: 0, likes: 0 }) as { stats: { runs: number } };
    expect(out.stats.runs).toBe(0);
  });

  it('is idempotent — migrating an already-current save changes nothing', () => {
    const once = migrateSave({ ...v1Payload });
    const twice = migrateSave({ ...once });
    expect(twice).toEqual(once);
  });

  it('does not spin on a corrupt or future version', () => {
    // A negative version has no migration step; a future one is already ahead.
    expect(() => migrateSave({ version: -5 })).not.toThrow();
    expect(migrateSave({ version: 999 }).version).toBe(999);
  });
});

describe('normalizeSave', () => {
  it('produces a complete, current SaveData from a v1 payload', () => {
    const save = normalizeSave(migrateSave({ ...v1Payload }));
    expect(save.version).toBe(SAVE_VERSION);
    expect(Object.keys(save).sort()).toEqual(Object.keys(DEFAULT_SAVE).sort());
  });

  it('falls back to defaults for a completely empty payload', () => {
    const save = normalizeSave({});
    expect(save.unlocked).toEqual(['ironclad']);
    expect(save.selectedAvatar).toBe('ironclad');
    expect(save.unlockedBackgrounds).toEqual(['violet']);
    expect(save.selectedBackground).toBe('violet');
    expect(save.stats).toEqual(freshStats());
  });

  it('drops ids that no longer exist but keeps the ones that do', () => {
    const save = normalizeSave({
      unlocked: ['ironclad', 'a-ship-we-deleted'],
      unlockedBackgrounds: ['violet', 'a-bg-we-deleted'],
    });
    expect(save.unlocked).toEqual(['ironclad']);
    expect(save.unlockedBackgrounds).toEqual(['violet']);
  });

  it('always re-grants the starter ship and background', () => {
    const save = normalizeSave({ unlocked: [], unlockedBackgrounds: [] });
    expect(save.unlocked).toContain('ironclad');
    expect(save.unlockedBackgrounds).toContain('violet');
  });

  it('refuses to leave a ship equipped that is not owned', () => {
    const save = normalizeSave({ unlocked: ['ironclad'], selectedAvatar: 'nova' });
    expect(save.selectedAvatar).toBe('ironclad');
  });

  it('clamps negative and non-finite currency values to zero', () => {
    const save = normalizeSave({ likes: -50, crystals: NaN, best: -1 });
    expect(save.likes).toBe(0);
    expect(save.crystals).toBe(0);
    expect(save.best).toBe(0);
  });

  it('strips an upgrade entry for a deleted ship', () => {
    const save = normalizeSave({ upgrades: { 'gone-ship': { damage: 4 }, ironclad: { damage: 2 } } });
    expect(save.upgrades['gone-ship']).toBeUndefined();
    expect(save.upgrades.ironclad).toEqual({ damage: 2 });
  });

  it('survives wrong-typed fields without throwing', () => {
    expect(() =>
      normalizeSave({
        best: 'lots',
        unlocked: 'ironclad',
        upgrades: 42,
        stats: 'none',
      })
    ).not.toThrow();
  });
});

describe('loadSave end to end', () => {
  it('reads and migrates a real v1 payload off disk', async () => {
    await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(v1Payload));
    const save = await loadSave();
    expect(save.likes).toBe(365);
    expect(save.best).toBe(4200);
    expect(save.selectedAvatar).toBe('raptor');
    expect(save.version).toBe(SAVE_VERSION);
  });

  it('returns defaults when nothing is stored', async () => {
    const save = await loadSave();
    expect(save.likes).toBe(0);
    expect(save.unlocked).toEqual(['ironclad']);
  });

  it('recovers from the backup when the primary payload is corrupt', async () => {
    await AsyncStorage.setItem(SAVE_KEY, '{ this is not json');
    await AsyncStorage.setItem(BACKUP_KEY, JSON.stringify(v1Payload));
    const save = await loadSave();
    // The player's 365 coins survive a corrupt primary write.
    expect(save.likes).toBe(365);
  });

  it('falls back to defaults when both copies are unreadable', async () => {
    await AsyncStorage.setItem(SAVE_KEY, 'nope');
    await AsyncStorage.setItem(BACKUP_KEY, 'also nope');
    const save = await loadSave();
    expect(save.likes).toBe(0);
  });

  it('never returns aliased defaults — mutating one load cannot affect the next', async () => {
    const a = await loadSave();
    a.unlocked.push('specter');
    const b = await loadSave();
    expect(b.unlocked).toEqual(['ironclad']);
  });

  it('writeSave rolls the previous payload into the backup slot', async () => {
    await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(v1Payload));
    const next: SaveData = { ...DEFAULT_SAVE, likes: 999 };
    await writeSave(next);
    expect(JSON.parse((await AsyncStorage.getItem(BACKUP_KEY))!).likes).toBe(365);
    expect(JSON.parse((await AsyncStorage.getItem(SAVE_KEY))!).likes).toBe(999);
  });

  it('writeSave always stamps the current version', async () => {
    await writeSave({ ...DEFAULT_SAVE, version: 1 });
    expect(JSON.parse((await AsyncStorage.getItem(SAVE_KEY))!).version).toBe(SAVE_VERSION);
  });

  it('a written save round-trips through load unchanged', async () => {
    const rich: SaveData = {
      ...DEFAULT_SAVE,
      best: 9000,
      likes: 120,
      crystals: 4,
      chips: 11,
      alloy: 2,
      unlocked: ['ironclad', 'nova'],
      selectedAvatar: 'nova',
      upgrades: { nova: { damage: 3, hull: 1 } },
      stats: { ...freshStats(), kills: 500, runs: 12 },
    };
    await writeSave(rich);
    expect(await loadSave()).toEqual(rich);
  });
});

describe('wallet mapping (coins live under the legacy `likes` key)', () => {
  it('balanceOf exposes coins from likes', () => {
    const save: SaveData = { ...DEFAULT_SAVE, likes: 70, chips: 3 };
    expect(balanceOf(save)).toEqual({ coins: 70, crystals: 0, chips: 3, alloy: 0 });
  });

  it('withBalance writes coins back to likes', () => {
    const save = withBalance(DEFAULT_SAVE, { coins: 5, crystals: 1, chips: 2, alloy: 3 });
    expect(save.likes).toBe(5);
    expect(save.crystals).toBe(1);
  });

  it('affords and spend agree with each other', () => {
    const save: SaveData = { ...DEFAULT_SAVE, likes: 100, chips: 2 };
    const price = { coins: 100, chips: 2 };
    expect(affords(save, price)).toBe(true);
    const after = spend(save, price);
    expect(after.likes).toBe(0);
    expect(after.chips).toBe(0);
    expect(affords(after, price)).toBe(false);
  });

  it('earn banks every currency a run produced', () => {
    const after = earn(DEFAULT_SAVE, { coins: 30, crystals: 2, chips: 1, alloy: 1 });
    expect(after.likes).toBe(30);
    expect(after.crystals).toBe(2);
    expect(after.chips).toBe(1);
    expect(after.alloy).toBe(1);
  });

  it('earn leaves untouched currencies alone', () => {
    const after = earn({ ...DEFAULT_SAVE, alloy: 5 }, { coins: 1 });
    expect(after.alloy).toBe(5);
  });
});
