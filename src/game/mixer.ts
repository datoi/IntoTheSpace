/**
 * The audio mixer — the player-controlled channels sitting between every
 * sound in the game and the speaker.
 *
 * Kept in its own module rather than inside sounds.ts because it imports
 * NOTHING: the board, the settings panel and the save layer all read the same
 * numbers, and a module with no dependencies of its own is the one arrangement
 * where none of them has to know about the others.
 *
 * It held a third channel, `music`, until the soundtrack was cut. A slider
 * that scales a family with no members is worse than no slider — the player
 * drags it, nothing changes, and every other control on the screen becomes
 * suspect — so the channel went with it. Stored saves still carrying a
 * `music` key are harmless: normalizeAudio only reads the channels in CHANNELS.
 *
 * The channel is a MULTIPLIER, never a replacement. Every per-event level in
 * the game — SYSTEM_VOICE's table, the shot throttle's 0.3 — stays exactly
 * where it is and stays the source of truth for how the mix is balanced. This
 * layer only lets the player scale a whole family at once, and at the default
 * of 1 the game sounds bit-for-bit as it always has.
 */

/**
 * The families a player can actually tell apart.
 *
 * Deliberately not one knob per board (pickups, system, shots, pops): those
 * are authoring categories, and a settings screen with six sliders is a
 * settings screen nobody touches. These two answer the real complaints — "the
 * game is too loud" and "stop clicking at me".
 */
export type Channel = 'ui' | 'sfx';

export type AudioSettings = Record<Channel, number>;

export const CHANNELS: Channel[] = ['ui', 'sfx'];

/**
 * Everything at unity.
 *
 * This is load-bearing: the shipped mix is the tuned one, and a fresh install
 * must hear exactly what the level tables say. Any default below 1 would mean
 * the game had two competing opinions about how loud it is, and the tables
 * would slowly be retuned to compensate for a number nobody remembered.
 */
export const DEFAULT_AUDIO: AudioSettings = { ui: 1, sfx: 1 };

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

/** Every channel, as a fresh object — safe to hand to React state. */
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

/** Replace every channel at once — used when the save lands at boot. */
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
 * The settings panel renders off it and App.tsx persists off it, and neither
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
 * Deliberately does NOT drop subscribers: a reset that cleared them would
 * silently disable any module-scope subscription after the first test in a
 * file, which is a seam manufacturing the exact bug it exists to catch. Tests
 * that add their own listener unsubscribe with the function onAudioChange
 * hands back.
 */
export function resetMixer(): void {
  Object.assign(gains, DEFAULT_AUDIO);
}
