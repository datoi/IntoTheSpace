/**
 * The audio mixer — three player-controlled channels sitting between every
 * sound in the game and the speaker.
 *
 * Kept in its own module rather than inside sounds.ts because MUSIC is not a
 * sound-board concern: music.ts owns one long stream with a lifecycle, the
 * board owns many short buffers fired by the game loop, and both need to read
 * the same three numbers. A module they can both import (and that imports
 * nothing itself) is the only arrangement where neither has to know about the
 * other.
 *
 * The channel is a MULTIPLIER, never a replacement. Every per-event level in
 * the game — SYSTEM_VOICE's table, the shot throttle's 0.3, MUSIC_BASE — stays
 * exactly where it is and stays the source of truth for how the mix is
 * balanced. This layer only lets the player scale a whole family at once, and
 * at the default of 1 the game sounds bit-for-bit as it always has.
 */

/**
 * The three families a player can actually tell apart.
 *
 * Deliberately not one knob per board (pickups, system, shots, pops): those
 * are authoring categories, and a settings screen with six sliders is a
 * settings screen nobody touches. These three answer the three real
 * complaints — "the music is too loud", "the game is too loud", "stop
 * clicking at me".
 */
export type Channel = 'ui' | 'sfx' | 'music';

export type AudioSettings = Record<Channel, number>;

export const CHANNELS: Channel[] = ['ui', 'sfx', 'music'];

/**
 * Everything at unity.
 *
 * This is load-bearing: the shipped mix is the tuned one, and a fresh install
 * must hear exactly what the level tables say. Any default below 1 would mean
 * the game had two competing opinions about how loud it is, and the tables
 * would slowly be retuned to compensate for a number nobody remembered.
 */
export const DEFAULT_AUDIO: AudioSettings = { ui: 1, sfx: 1, music: 1 };

const gains: AudioSettings = { ...DEFAULT_AUDIO };

type Listener = (settings: AudioSettings) => void;
const listeners = new Set<Listener>();

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Coerce a stored (or otherwise untrusted) payload into usable gains. */
export function normalizeAudio(raw: unknown): AudioSettings {
  const src = (raw ?? {}) as Partial<Record<Channel, unknown>>;
  const out = { ...DEFAULT_AUDIO };
  for (const ch of CHANNELS) {
    const v = src[ch];
    // A NaN here would silence a channel forever with no way to tell why, so
    // anything that is not a finite number falls back to unity rather than to
    // zero. Missing is "never configured", not "muted".
    if (typeof v === 'number' && Number.isFinite(v)) out[ch] = clamp01(v);
  }
  return out;
}

/** The live gain for one channel, 0..1. */
export function channelVolume(ch: Channel): number {
  return gains[ch];
}

/** All three, as a fresh object — safe to hand to React state. */
export function audioSettings(): AudioSettings {
  return { ...gains };
}

function emit(): void {
  const snapshot = audioSettings();
  for (const fn of listeners) {
    try {
      fn(snapshot);
    } catch {
      // A listener that throws must not take the other listeners — or the
      // drag that triggered them — down with it.
    }
  }
}

/**
 * Set one channel. No-ops (and notifies nobody) if the value hasn't moved,
 * which is what keeps a drag gesture from writing to disk sixty times a
 * second — see the persistence effect in App.tsx.
 */
export function setChannelVolume(ch: Channel, value: number): void {
  const next = clamp01(value);
  if (gains[ch] === next) return;
  gains[ch] = next;
  emit();
}

/** Replace all three at once — used when the save lands at boot. */
export function setAudioSettings(next: Partial<AudioSettings>): void {
  let changed = false;
  for (const ch of CHANNELS) {
    const v = next[ch];
    if (v === undefined) continue;
    const clamped = clamp01(v);
    if (gains[ch] === clamped) continue;
    gains[ch] = clamped;
    changed = true;
  }
  if (changed) emit();
}

/**
 * Subscribe to changes. Returns an unsubscribe.
 *
 * Two very different consumers depend on this: music.ts re-applies the volume
 * of the track that is ALREADY PLAYING (a slider that only took effect on the
 * next track would read as broken), and App.tsx persists the result. Neither
 * knows about the other.
 */
export function onAudioChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Testing seam — return to the shipped mix.
 *
 * Deliberately does NOT drop subscribers. music.ts subscribes once at module
 * scope, for the life of the app, so that a slider re-levels the track already
 * playing; a reset that cleared listeners silently disabled that after the
 * first test in a file, which is a seam manufacturing the exact bug it exists
 * to catch. Tests that add their own listener unsubscribe with the function
 * onAudioChange hands back.
 */
export function resetMixer(): void {
  Object.assign(gains, DEFAULT_AUDIO);
}
