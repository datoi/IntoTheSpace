import { Asset } from 'expo-asset';
import {
  AVATARS,
  ENEMY_SHIPS,
  BG_SETS,
  BOSS_MINI_IMG,
  BOSS_GIANT_IMG,
  BOSS_MINI_VIS,
  BOSS_GIANT_VIS,
  SHOT_NORMAL_IMG,
  SHOT_HOMING_IMG,
  SHOT_BOMB_IMG,
  LASERSHOTS,
  LASERSHOT_ASPECT,
  ENEMY_BULLET_SIZE,
  ENEMY_BULLET_ART_SCALE,
  ENEMY_SHIP_VIS,
  AVATAR_IMG_W,
  AVATAR_IMG_H,
  SHOT_NORMAL_W,
  SHOT_NORMAL_H,
  SHOT_HOMING_W,
  SHOT_HOMING_H,
  SHOT_BOMB_SIZE,
  PRELOAD_TIMEOUT_MS,
  PRELOAD_BATCH,
} from './constants';

export interface PreloadSprite {
  src: number;
  w: number;
  h: number;
}

// Sprites mounted hidden at their true in-game size during boot, so the native
// image cache holds a decoded bitmap of the right dimensions before the game
// loop — which starts dealing damage on its first frame — can spawn anything.
// Backgrounds are deliberately NOT in this list: mounting all 21 of them
// full-screen would hold ~75MB of bitmaps and risk an OOM on low-end devices.
// They get file-level caching below plus GameScreen's own crossfade preload,
// which has BG_FADE_S (25s) of lead time before a set is ever visible.
export const PRELOAD_SPRITES: PreloadSprite[] = [
  ...AVATARS.map((a) => a.image).filter((src): src is number => src != null).map((src) => ({
    src,
    w: AVATAR_IMG_W,
    h: AVATAR_IMG_H,
  })),
  ...ENEMY_SHIPS.map((src) => ({ src, w: ENEMY_SHIP_VIS, h: ENEMY_SHIP_VIS })),
  { src: BOSS_MINI_IMG, w: BOSS_MINI_VIS, h: BOSS_MINI_VIS },
  { src: BOSS_GIANT_IMG, w: BOSS_GIANT_VIS, h: BOSS_GIANT_VIS },
  { src: SHOT_NORMAL_IMG, w: SHOT_NORMAL_W, h: SHOT_NORMAL_H },
  { src: SHOT_HOMING_IMG, w: SHOT_HOMING_W, h: SHOT_HOMING_H },
  { src: SHOT_BOMB_IMG, w: SHOT_BOMB_SIZE, h: SHOT_BOMB_SIZE },
  ...LASERSHOTS.map((src, i) => {
    const w = ENEMY_BULLET_SIZE * ENEMY_BULLET_ART_SCALE;
    return { src, w, h: w / LASERSHOT_ASPECT[i] };
  }),
];

// Every module the run can reach, backgrounds included. Downloading only puts
// the file on disk (no bitmap memory), so covering all of it is cheap — and in
// development it's the expensive part, since each uncached require() is an HTTP
// round trip to the Metro dev server mid-gameplay.
const bgModules = BG_SETS.flatMap((set) => [
  ...(set.base !== undefined ? [set.base] : []),
  ...set.layers.map((l) => l.src),
]);

export const PRELOAD_MODULES: number[] = [
  ...new Set<number>([...PRELOAD_SPRITES.map((s) => s.src), ...bgModules]),
];

const wait = (ms: number): { promise: Promise<void>; cancel: () => void } => {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
};

// Fetch every asset into the local cache, reporting progress. Never rejects and
// never hangs: a failed asset is skipped (the game still runs, that one sprite
// just paints late) and the whole pass is bounded by PRELOAD_TIMEOUT_MS.
export async function preloadAssets(onProgress?: (done: number, total: number) => void): Promise<void> {
  const total = PRELOAD_MODULES.length;
  let done = 0;
  onProgress?.(0, total);

  const fetchAll = async () => {
    for (let i = 0; i < total; i += PRELOAD_BATCH) {
      const batch = PRELOAD_MODULES.slice(i, i + PRELOAD_BATCH);
      await Promise.all(
        batch.map(async (mod) => {
          try {
            await Asset.fromModule(mod).downloadAsync();
          } catch {
            // A single unreachable asset must not block the boot.
          }
          done += 1;
          onProgress?.(done, total);
        })
      );
    }
  };

  const guard = wait(PRELOAD_TIMEOUT_MS);
  try {
    await Promise.race([fetchAll(), guard.promise]);
  } finally {
    guard.cancel();
  }
}
