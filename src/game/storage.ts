import AsyncStorage from '@react-native-async-storage/async-storage';
import { GameState } from './types';

const KEY = 'doomscroll:save:v1';
// v4: coins replaced score/combo and 'moment' cards became 'heart' — older
// snapshots would resume with undefined coins and unrenderable cards.
const RUN_KEY = 'doomscroll:run:v4';

export interface SaveData {
  best: number;
  likes: number;
  unlocked: string[]; // avatar ids
  selectedAvatar: string;
  unlockedBackgrounds: string[]; // background ids
  selectedBackground: string;
}

export const DEFAULT_SAVE: SaveData = {
  best: 0,
  likes: 0,
  unlocked: ['ironclad'],
  selectedAvatar: 'ironclad',
  unlockedBackgrounds: ['violet'],
  selectedBackground: 'violet',
};

// A spread of DEFAULT_SAVE would alias its array fields — callers mutating the
// returned save would corrupt the module-level default.
const freshDefault = (): SaveData => ({
  ...DEFAULT_SAVE,
  unlocked: [...DEFAULT_SAVE.unlocked],
  unlockedBackgrounds: [...DEFAULT_SAVE.unlockedBackgrounds],
});

export async function loadSave(): Promise<SaveData> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return freshDefault();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...freshDefault(),
      ...parsed,
      unlocked: parsed.unlocked?.length ? parsed.unlocked : ['ironclad'],
      unlockedBackgrounds: parsed.unlockedBackgrounds?.length ? parsed.unlockedBackgrounds : ['violet'],
    };
  } catch {
    return freshDefault();
  }
}

export async function writeSave(data: SaveData): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Non-fatal.
  }
}

// --- In-progress run (for pause / resume-after-close) ---
export async function loadRun(): Promise<GameState | null> {
  try {
    const raw = await AsyncStorage.getItem(RUN_KEY);
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch {
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
