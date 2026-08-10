import AsyncStorage from '@react-native-async-storage/async-storage';
import { GameState } from './types';
import {
  Balance,
  Currency,
  Price,
  Stats,
  UpgradeBook,
  canAfford,
  debit,
  freshStats,
  normalizeStats,
  normalizeUpgrades,
} from './progression';
import { MAX_UPGRADE_LEVEL } from './upgrades';
import { QuestState, freshQuests, normalizeQuests } from './missions';
import { AVATARS, BACKGROUNDS } from './constants';

const KEY = 'doomscroll:save:v1'; // storage key is historical — the SCHEMA is
// versioned inside the payload (see SAVE_VERSION), which is what migrations
// key off. Changing this key would orphan every existing player's progress.
const BACKUP_KEY = 'doomscroll:save:backup';
// v4: coins replaced score/combo and 'moment' cards became 'heart' — older
// snapshots would resume with undefined coins and unrenderable cards.
// Deliberately NOT bumped for the progression update: every field added to
// GameState since is supplied by the `{...fresh(), ...resume}` merge in
// GameScreen, and cards without an archetype fall back to the original
// hold-and-shoot behaviour — so an in-flight run survives the upgrade.
const RUN_KEY = 'doomscroll:run:v4';

/**
 * Save schema version. Bump ONLY when an existing field changes meaning or
 * shape; purely additive fields are handled by the normalizers instead, which
 * is why this has stayed at 2 through several feature additions.
 *
 *   1 — best / likes / unlocked / selectedAvatar / background ids
 *   2 — adds deep currencies, the per-ship upgrade book, and lifetime stats
 */
export const SAVE_VERSION = 2;

export interface SaveData {
  version: number;
  best: number;
  /**
   * The coin wallet. Named `likes` for historical reasons and deliberately
   * left that way: it is the key already written to every existing player's
   * device, and renaming it would need a migration that buys nothing.
   */
  likes: number;
  crystals: number;
  chips: number;
  alloy: number;
  unlocked: string[]; // avatar ids
  selectedAvatar: string;
  unlockedBackgrounds: string[]; // background ids
  selectedBackground: string;
  /** shipId → track → level. Sparse; `{}` means nothing bought yet. */
  upgrades: UpgradeBook;
  stats: Stats;
  /**
   * Missions, achievements, milestones, daily/weekly challenges and the login
   * streak. Purely additive — an older save reads as "nothing claimed yet", so
   * this needed no SAVE_VERSION bump (see the note on SAVE_VERSION).
   */
  quests: QuestState;
}

export const DEFAULT_SAVE: SaveData = {
  version: SAVE_VERSION,
  best: 0,
  likes: 0,
  crystals: 0,
  chips: 0,
  alloy: 0,
  unlocked: ['ironclad'],
  selectedAvatar: 'ironclad',
  unlockedBackgrounds: ['violet'],
  selectedBackground: 'violet',
  upgrades: {},
  stats: freshStats(),
  quests: freshQuests(),
};

// A spread of DEFAULT_SAVE would alias its array/object fields — callers
// mutating the returned save would corrupt the module-level default.
const freshDefault = (): SaveData => ({
  ...DEFAULT_SAVE,
  unlocked: [...DEFAULT_SAVE.unlocked],
  unlockedBackgrounds: [...DEFAULT_SAVE.unlockedBackgrounds],
  upgrades: {},
  stats: freshStats(),
  quests: freshQuests(),
});

// --- Wallet helpers ----------------------------------------------------------
// The save stores coins under `likes`; everything else in the game talks in
// terms of a `Balance`. These two functions are the only place that mapping
// lives, so no caller has to remember the legacy field name.

export function balanceOf(save: SaveData): Balance {
  return {
    coins: save.likes,
    crystals: save.crystals,
    chips: save.chips,
    alloy: save.alloy,
  };
}

export function withBalance(save: SaveData, bal: Balance): SaveData {
  return {
    ...save,
    likes: bal.coins,
    crystals: bal.crystals,
    chips: bal.chips,
    alloy: bal.alloy,
  };
}

export const affords = (save: SaveData, price: Price): boolean => canAfford(balanceOf(save), price);

/** Deduct a price, returning the updated save. Caller must check `affords` first. */
export const spend = (save: SaveData, price: Price): SaveData =>
  withBalance(save, debit(balanceOf(save), price));

export function earn(save: SaveData, gained: Partial<Record<Currency, number>>): SaveData {
  const bal = balanceOf(save);
  return withBalance(save, {
    coins: bal.coins + (gained.coins ?? 0),
    crystals: bal.crystals + (gained.crystals ?? 0),
    chips: bal.chips + (gained.chips ?? 0),
    alloy: bal.alloy + (gained.alloy ?? 0),
  });
}

// --- Migration ---------------------------------------------------------------

/** A stored payload of unknown vintage, before migration. */
type RawSave = Record<string, unknown>;

const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const strArray = (v: unknown): string[] | undefined =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : undefined;

/**
 * v1 → v2. Purely additive: v1 had no currencies beyond coins, no upgrades and
 * no stats, so the new fields start empty and the player keeps everything they
 * had earned. `runs` is seeded to 1 when a v1 player had already set a best, so
 * their statistics screen doesn't open claiming they have never played.
 */
function migrate1to2(raw: RawSave): RawSave {
  return {
    ...raw,
    version: 2,
    crystals: 0,
    chips: 0,
    alloy: 0,
    upgrades: {},
    stats: {
      ...freshStats(),
      runs: num(raw.best) > 0 ? 1 : 0,
      highestWave: 0,
    },
  };
}

/**
 * Stepwise migration chain. Each entry takes the payload at version N and
 * returns it at N+1, so a save from any past build walks forward one step at a
 * time rather than needing a bespoke path per origin version.
 */
const MIGRATIONS: Record<number, (raw: RawSave) => RawSave> = {
  1: migrate1to2,
};

export function migrateSave(raw: RawSave): RawSave {
  // A payload with no `version` predates versioning entirely — that is v1.
  let out = raw;
  let v = num(out.version, 1);
  // Bounded by the version count, so a corrupt `version: -5` or a save from a
  // FUTURE build can never spin here.
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) break; // no path forward; the normalizer below still fills gaps
    out = step(out);
    v = num(out.version, v + 1);
  }
  return out;
}

/**
 * Turn an arbitrary stored payload into a valid SaveData.
 *
 * Runs after migration and is the last line of defence: every field is checked
 * against the live catalogs, so a save naming a ship that no longer exists — or
 * carrying a NaN where a count belongs — degrades to a sensible default instead
 * of crashing a screen or poisoning the upgrade maths.
 */
export function normalizeSave(raw: RawSave): SaveData {
  const shipIds = AVATARS.map((a) => a.id);
  const bgIds = BACKGROUNDS.map((b) => b.id);

  // Keep only ids that still exist, and never end up with an empty set —
  // the starter ship and background are always owned.
  const unlocked = (strArray(raw.unlocked) ?? []).filter((id) => shipIds.includes(id));
  if (!unlocked.includes('ironclad')) unlocked.unshift('ironclad');
  const unlockedBackgrounds = (strArray(raw.unlockedBackgrounds) ?? []).filter((id) => bgIds.includes(id));
  if (!unlockedBackgrounds.includes('violet')) unlockedBackgrounds.unshift('violet');

  const selectedAvatar =
    typeof raw.selectedAvatar === 'string' && unlocked.includes(raw.selectedAvatar)
      ? raw.selectedAvatar
      : unlocked[0];
  const selectedBackground =
    typeof raw.selectedBackground === 'string' && unlockedBackgrounds.includes(raw.selectedBackground)
      ? raw.selectedBackground
      : unlockedBackgrounds[0];

  return {
    version: SAVE_VERSION,
    best: Math.max(0, Math.floor(num(raw.best))),
    likes: Math.max(0, Math.floor(num(raw.likes))),
    crystals: Math.max(0, Math.floor(num(raw.crystals))),
    chips: Math.max(0, Math.floor(num(raw.chips))),
    alloy: Math.max(0, Math.floor(num(raw.alloy))),
    unlocked,
    selectedAvatar,
    unlockedBackgrounds,
    selectedBackground,
    upgrades: normalizeUpgrades(raw.upgrades, shipIds, MAX_UPGRADE_LEVEL),
    stats: normalizeStats(raw.stats as Partial<Stats> | undefined),
    // The stat normalizer is passed IN rather than imported by missions.ts,
    // which keeps the quest engine free of any dependency on the save layer.
    quests: normalizeQuests(raw.quests, (v) => normalizeStats(v as Partial<Stats> | undefined)),
  };
}

// --- Load / write ------------------------------------------------------------

async function readKey(key: string): Promise<RawSave | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' ? (parsed as RawSave) : null;
}

/**
 * Load the save, migrating and validating it.
 *
 * Falls back to the rolling backup if the primary payload is missing or
 * unreadable, and to a fresh save if both are. A player losing their progress
 * to one bad write is the worst outcome this module can produce, so the backup
 * is checked before ever handing back defaults.
 */
export async function loadSave(): Promise<SaveData> {
  for (const key of [KEY, BACKUP_KEY]) {
    try {
      const raw = await readKey(key);
      if (raw) return normalizeSave(migrateSave(raw));
    } catch {
      // Corrupt JSON at this key — try the next one.
    }
  }
  return freshDefault();
}

export async function writeSave(data: SaveData): Promise<void> {
  try {
    // Roll the previous good payload into the backup slot first, so a write
    // interrupted midway (or a payload that later fails to parse) still leaves
    // one recoverable generation behind.
    const prev = await AsyncStorage.getItem(KEY);
    if (prev) await AsyncStorage.setItem(BACKUP_KEY, prev);
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
  } catch {
    // Non-fatal.
  }
}

// --- In-progress run (for pause / resume-after-close) ---

/**
 * Every field of GameState that the loop ITERATES rather than reads.
 *
 * These are the ones that turn a bad snapshot into a crash: GameScreen resumes
 * with `{ ...freshRunState(stats), ...resume }`, which only backfills keys that
 * are ABSENT. A key present as `null` overwrites the fresh array, and the first
 * `for (const c of s.cards)` throws out of the loop with nothing to catch it.
 */
const RUN_ARRAYS = [
  'novaHits',
  'coinQueue',
  'spearQueue',
  'bullets',
  'enemyBullets',
  'cards',
  'particles',
  'explosions',
  'floats',
] as const;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Make a stored snapshot safe to spread over a fresh run state.
 *
 * loadSave has always run migrate + normalizeSave; loadRun was a bare
 * `JSON.parse(raw) as GameState`, which is a cast, not a check. The asymmetry
 * mattered because of the failure mode rather than the likelihood: persistRun
 * only ever writes a valid deep copy, so this needs storage corruption or a
 * build that wrote a different shape — but the result was an uncaught throw out
 * of render on every launch, and the bad snapshot is re-read each time. An
 * unrecoverable boot loop is worth a few lines of coercion.
 *
 * Deliberately NOT a full schema check. Dropping null/undefined lets the
 * caller's spread fall back to the fresh value for anything missing, which
 * covers every scalar at once; only the containers need an explicit type test,
 * because those are what get iterated.
 */
export function normalizeRun(raw: unknown): GameState | null {
  if (!isPlainObject(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    // Absent beats present-and-null: the spread then supplies the real default.
    if (v === null || v === undefined) continue;
    out[k] = v;
  }
  for (const key of RUN_ARRAYS) {
    if (!Array.isArray(out[key])) delete out[key];
  }
  if (!isPlainObject(out.boons)) delete out.boons;
  return out as unknown as GameState;
}

export async function loadRun(): Promise<GameState | null> {
  try {
    const raw = await AsyncStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const run = normalizeRun(JSON.parse(raw));
    // A payload we cannot make sense of is discarded rather than left to be
    // re-read (and re-fail) on every future launch.
    if (!run) await clearRun();
    return run;
  } catch {
    // Unparseable JSON — same reasoning: drop it so the next boot is clean.
    await clearRun();
    return null;
  }
}

export async function saveRun(state: GameState): Promise<void> {
  try {
    await AsyncStorage.setItem(RUN_KEY, JSON.stringify(state));
  } catch {
    // Non-fatal.
  }
}

export async function clearRun(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RUN_KEY);
  } catch {
    // Non-fatal.
  }
}
