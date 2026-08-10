import { Asset } from 'expo-asset';
import {
  AVATARS,
  ENEMY_SHIPS,
  BG_SETS,
  BOSS_MINI_IMG,
  BOSS_GIANT_IMG,
  BOSS_MINI_VIS,
  BOSS_GIANT_VIS,
  SHOT_HOMING_IMG,
  SHOT_BOMB_IMG,
  SHOT_LASER_IMG,
  ENEMY_SHOTS,
  ENEMY_SHOT_ASPECT,
  EXPLOSIONS,
  EXPLOSION_VIS,
  EXPLOSION_BOSS,
  EXPLOSION_BOSS_SCALE,
  PLAYER_SHOT_LEN,
  ENEMY_BULLET_SIZE,
  ENEMY_BULLET_ART_SCALE,
  ENEMY_SHIP_VIS,
  AVATAR_IMG_W,
  AVATAR_IMG_H,
  SHOT_HOMING_LEN,
  SHOT_HOMING_THICK,
  SHOT_BOMB_W,
  SHOT_BOMB_H,
  SHOT_LASER_LEN,
  SHOT_LASER_THICK,
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
// Backgrounds are deliberately NOT in this list: mounting every set's layers
// full-screen would hold tens of MB of bitmaps and risk an OOM on low-end
// devices. A run shows only one set (the player's pick), and it gets file-level
// caching below — its layers decode on GameScreen mount, before the climb.
export const PRELOAD_SPRITES: PreloadSprite[] = [
  ...AVATARS.map((a) => a.image).filter((src): src is number => src != null).map((src) => ({
    src,
    w: AVATAR_IMG_W,
    h: AVATAR_IMG_H,
  })),
  ...ENEMY_SHIPS.map((src) => ({ src, w: ENEMY_SHIP_VIS, h: ENEMY_SHIP_VIS })),
  { src: BOSS_MINI_IMG, w: BOSS_MINI_VIS, h: BOSS_MINI_VIS },
  { src: BOSS_GIANT_IMG, w: BOSS_GIANT_VIS, h: BOSS_GIANT_VIS },
  { src: SHOT_HOMING_IMG, w: SHOT_HOMING_LEN, h: SHOT_HOMING_THICK },
  { src: SHOT_BOMB_IMG, w: SHOT_BOMB_W, h: SHOT_BOMB_H },
  { src: SHOT_LASER_IMG, w: SHOT_LASER_LEN, h: SHOT_LASER_THICK },
  // Every avatar's fire shot — any of them can be equipped, so warm them all.
  ...AVATARS.map((a) => ({ src: a.shot.src, w: PLAYER_SHOT_LEN, h: PLAYER_SHOT_LEN / a.shot.aspect })),
  ...ENEMY_SHOTS.map((src, i) => {
    const w = ENEMY_BULLET_SIZE * ENEMY_BULLET_ART_SCALE;
    return { src, w, h: w / ENEMY_SHOT_ASPECT[i] };
  }),
  // Every explosion frame. A death animation steps ten sources in under half a
  // second, so a cold decode part-way through would drop frames out of the
  // middle of the burst — the one place a gap is most visible. Warmed at their
  // DRAWN size (92px), not the 192px source, so all sixty cost a few MB.
  ...EXPLOSIONS.flat().map((src) => ({ src, w: EXPLOSION_VIS, h: EXPLOSION_VIS })),
  // …and the boss style AGAIN at the size a boss actually draws it.
  //
  // A bitmap warmed at one size decodes again at another, and a boss fireball
  // is EXPLOSION_BOSS_SCALE× the ordinary one — so every frame of the biggest
  // explosion in the game was decoding cold despite the line above, ten of them
  // inside half a second, on the frame a boss dies. That frame is already
  // carrying the payout fan, the debris burst and a forced hit-stop; the decode
  // was landing on top of the worst of it. Only the one style a boss uses needs
  // this, so it costs ten bitmaps rather than sixty.
  ...EXPLOSIONS[EXPLOSION_BOSS].map((src) => ({
    src,
    w: EXPLOSION_VIS * EXPLOSION_BOSS_SCALE,
    h: EXPLOSION_VIS * EXPLOSION_BOSS_SCALE,
  })),
];

// Every module the run can reach, backgrounds included. Downloading only puts
// the file on disk (no bitmap memory), so covering all of it is cheap — and in
// development it's the expensive part, since each uncached require() is an HTTP
// round trip to the Metro dev server mid-gameplay.
const bgModules = BG_SETS.flatMap((set) => [
  ...(set.base !== undefined ? [set.base] : []),
  ...set.layers.map((l) => l.src),
  ...(set.planet ? set.planet.items.map((it) => it.src) : []),
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
