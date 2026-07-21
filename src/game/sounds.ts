import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';

/**
 * Tiny imperative sound board. Each effect gets its own player so rapid
 * retriggers just seek back to 0. The pops are 5 pre-pitched samples, so
 * callers pick a pitch to distinguish what just happened (a coin from a
 * heart from a kill).
 */
const sources = {
  pop1: require('../../assets/sounds/pop1.wav'),
  pop2: require('../../assets/sounds/pop2.wav'),
  pop3: require('../../assets/sounds/pop3.wav'),
  pop4: require('../../assets/sounds/pop4.wav'),
  pop5: require('../../assets/sounds/pop5.wav'),
  buzz: require('../../assets/sounds/buzz.wav'),
  ding: require('../../assets/sounds/ding.wav'),
  whoosh: require('../../assets/sounds/whoosh.wav'),
  gameover: require('../../assets/sounds/gameover.wav'),
} as const;

type SoundName = keyof typeof sources;

const players: Partial<Record<SoundName, AudioPlayer>> = {};
let ready = false;

export async function initSounds(): Promise<void> {
  if (ready) return;
  try {
    // Play even when the iPhone mute switch is on — it's a game.
    await setAudioModeAsync({ playsInSilentMode: true });
    (Object.keys(sources) as SoundName[]).forEach((name) => {
      players[name] = createAudioPlayer(sources[name]);
    });
    ready = true;
  } catch {
    // No audio is annoying but never fatal.
  }
}

export function play(name: SoundName, volume = 1): void {
  const p = players[name];
  if (!p) return;
  try {
    p.volume = volume;
    p.seekTo(0);
    p.play();
  } catch {
    // Ignore playback hiccups mid-game.
  }
}

/** Collect pop at one of 5 rising pitches (clamped), chosen by the caller. */
export function playPop(pitch: number): void {
  const idx = Math.max(1, Math.min(5, pitch));
  play(`pop${idx}` as SoundName, 0.9);
}
