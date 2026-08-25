// Shared synthesis plumbing for the sound generators.
//
// Extracted from make-shot-sfx.mjs when make-pickup-sfx.mjs needed the same
// WAV writer, the same seeded noise and the same loudness rule. These are the
// parts that must NOT drift between generators: two scripts writing subtly
// different WAV headers, or normalising to different targets, is exactly how a
// sound board ends up with one voice that sits wrong in the mix and no
// obvious reason why.
//
// Character decisions do not live here — those belong in the generator that
// owns the voice.

export const RATE = 44100;

/** 16-bit mono PCM WAV — the only format assetBundlePatterns ships. */
export function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/**
 * Deterministic noise source (mulberry32).
 *
 * The generators used Math.random(), which meant every run produced different
 * bytes for any voice using noise — so regenerating to retune ONE voice
 * rewrote assets whose parameters had not changed, and every binary diff
 * looked identical to a real edit. Seeding makes output a pure function of the
 * parameters, which is the property that lets you trust `git diff` on a .wav.
 *
 * Quality is irrelevant here — this fills short noise bursts that a one-pole
 * lowpass then eats. Cheap and reproducible is the whole spec.
 */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a, used to seed each voice from its own filename.
 *
 * Seeding from the name rather than a counter matters: a counter would tie a
 * voice's noise to its POSITION, so adding a voice or reordering the list
 * would silently rewrite the others. Keyed by name, each voice's bytes depend
 * only on that voice.
 */
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Scale a rendered buffer to a target loudness under a peak ceiling.
 *
 * Modulation costs RMS at a fixed peak — a ring modulator drags the waveform
 * to (1 - 2*mix) of full swing at its troughs, a detuned pair nulls whenever
 * it beats, and a two-note arpeggio spends half its length on each note. Peak
 * normalisation alone therefore hands back a sound that measures the same and
 * *sounds* several dB quieter, and a timbre change that quietly also drops the
 * level is a change nobody can judge, because the ear reads "quieter" as
 * "worse" no matter the timbre.
 *
 * So `loudness` (target RMS) does the work and `peak` is only a ceiling. If
 * the ceiling binds, the waveform has no room left to give and the fix is less
 * modulation, not a higher ceiling.
 *
 * @param out       Float64Array of rendered samples.
 * @param peak      Absolute sample ceiling.
 * @param loudness  Target RMS; 0 falls back to plain peak normalisation.
 * @param label     Voice name, used only in the ceiling warning.
 */
export function normalise(out, { peak, loudness = 0, label = '' }) {
  const max = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  let gain = peak / max;
  if (loudness) {
    const rms = Math.sqrt(out.reduce((s, v) => s + v * v, 0) / out.length) || 1;
    const wanted = loudness / rms;
    if (wanted > gain) {
      console.warn(`  ! ${label} peak ceiling ${peak} binds: want ${(wanted / gain).toFixed(2)}x more level. Reduce modulation.`);
    }
    gain = Math.min(wanted, gain);
  }
  return Array.from(out, (v) => v * gain);
}

/**
 * One note-sequence voice — the synth behind both the pickup and the system
 * event boards.
 *
 * Where shot() sweeps a single tone, this steps through `notes`. An INTERVAL
 * is the payload: two pitches are recognisable at a volume and duration where
 * a single pitch is not, and the DIRECTION of the interval is what the ear
 * reads as meaning. Rising says gained, falling says spent or stopped. Every
 * voice built on this should have an opinion about which way it goes.
 *
 * @param notes   Frequencies in Hz, played in equal slices of `ms`.
 * @param glide   0 steps between notes, 1 glides. Stepping is cleaner and
 *   reads as deliberate; glide suits the electrical voices where a smear is
 *   the character.
 * @param decay   Per-note exponential decay. High values make each note a
 *   distinct blip, low values let notes bleed into a chime.
 * @param ring / ringMix / detune  Same levers as the gun — see
 *   scripts/make-shot-sfx.mjs for why fixed-Hz ring and wide detune.
 * @param loudness  Target RMS; see normalise() in lib/audio.mjs.
 */
export function tones({
  name = '',
  ms,
  notes,
  glide = 0,
  square = 0.35,
  noise = 0,
  cutoff = 0.45,
  decay = 5,
  detune = 0,
  ring = 0,
  ringMix = 0.3,
  peak = 0.9,
  loudness = 0.17,
  seed = 1,
}) {
  const n = Math.floor((ms / 1000) * RATE);
  const out = new Float64Array(n);
  const rand = rng(seed);
  const seg = n / notes.length;
  let phase = 0;
  let phase2 = 0;
  let ringPhase = 0;
  let lp = 0;

  for (let i = 0; i < n; i++) {
    const idx = Math.min(notes.length - 1, Math.floor(i / seg));
    const local = (i - idx * seg) / seg; // 0..1 within the current note

    let freq = notes[idx];
    if (glide && idx < notes.length - 1) {
      freq += (notes[idx + 1] - notes[idx]) * Math.pow(local, 1 / glide);
    }

    phase += (2 * Math.PI * freq) / RATE;
    phase2 += (2 * Math.PI * (freq + detune)) / RATE;
    ringPhase += (2 * Math.PI * ring) / RATE;

    const sine = detune ? (Math.sin(phase) + Math.sin(phase2)) * 0.5 : Math.sin(phase);
    const buzz = Math.tanh(sine * 3.2) / Math.tanh(3.2);
    let v = sine * (1 - square) + buzz * square;
    if (ring) v = v * (1 - ringMix) + v * Math.cos(ringPhase) * ringMix;
    if (noise) v += (rand() * 2 - 1) * noise * Math.pow(1 - local, 8);

    // Envelope is PER NOTE, not per sound: each note needs its own attack or
    // the second one arrives as a pitch jump inside a single sustained tone,
    // which reads as a glitch rather than as a second note.
    const attack = Math.min(1, (i - idx * seg) / (0.0025 * RATE));
    v *= attack * Math.exp(-decay * local);

    lp += (v - lp) * cutoff;
    out[i] = lp;
  }

  // 4 ms release. The last note's decay does not always reach zero by the end
  // of the buffer, and a WAV that stops on a non-zero sample clicks.
  const rel = Math.floor(0.004 * RATE);
  for (let i = Math.max(0, n - rel); i < n; i++) out[i] *= (n - i) / rel;

  return normalise(out, { peak, loudness, label: name });
}
