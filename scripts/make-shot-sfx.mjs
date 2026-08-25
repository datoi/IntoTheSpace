// Synthesise the player's gun sounds.
//
// Firing is the single most repeated action in the game and it had no sound of
// its own: playShot() borrowed `whoosh` at volume 0.1, which is effectively
// inaudible. In an arcade shooter the gun IS the game's texture, so this
// generates three short, dry blips — one per weapon family — rather than
// leaving the primary action silent.
//
// Generated rather than sourced so the sounds can be RETUNED: every character
// decision below is a number you can move, and re-running the script is the
// whole edit loop. Run:  node scripts/make-shot-sfx.mjs
//
// Design constraints, in order of importance:
//  - SHORT. These fire several times a second; anything with a tail turns into
//    mud. All three are under 110 ms.
//  - QUIET and DRY. No reverb, no long release. The mix has to leave room for
//    the kill-pitch ladder (see playKill) which is the sound that carries
//    information; the gun is texture underneath it.
//  - DISTINCT PER WEAPON, but from one family — they are the same ship.

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { RATE, wav, rng, hash, normalise } from './lib/audio.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

/**
 * One shot.
 *
 * A pitch sweep is what makes a blip read as a SHOT rather than a beep — the
 * ear hears falling pitch as something departing. `curve` shapes that fall:
 * >1 drops fast then settles (snappier), <1 glides.
 *
 * `detune` and `ring` are the two "cosmic" levers. Both default to off, so a
 * voice that omits them generates exactly what it did before they existed.
 *
 * @param detune  Hz offset of a second oscillator. Hz and not cents: the beat
 *   rate is the whole point, and an absolute offset beats at exactly `detune`
 *   Hz wherever the sweep currently sits, while a cents detune would slow its
 *   shimmer as the pitch falls. Keep it wide — 15-40 Hz. A tasteful 5 Hz
 *   chorus has a 200 ms period and this sound is over in 85, so you would hear
 *   a third of one beat and call it "slightly out of tune"; wide offsets are
 *   what read as metallic shimmer in a window this short.
 * @param ring  Ring-modulator frequency in Hz, fixed rather than tracking the
 *   carrier. Deliberate: fixed Hz puts sidebands at f±ring, inharmonic ratios
 *   that keep drifting as the sweep falls, and inharmonic is what the ear
 *   files under "not of this Earth". A modulator that tracked the pitch would
 *   land on harmonic ratios and just sound like a different waveform.
 * @param ringMix  Dry/wet, 0..1. Full wet nulls the fundamental and leaves a
 *   hollow bell with no weight behind it — the gun still needs a body, so keep
 *   this under ~0.5. Also the main cost centre for level; see `loudness`.
 * @param peak  Absolute sample ceiling. A ceiling, not a target, once
 *   `loudness` is set.
 * @param loudness  Target RMS. Set it and the voice is scaled to that average
 *   level instead of to `peak`, so re-tuning timbre does not silently re-tune
 *   volume. The three values in use are the RMS these voices measured before
 *   ring-mod existed, which is what keeps this an A/B of character alone.
 * @param seed  Seeds the noise burst. Supplied per voice from its filename, so
 *   output is reproducible; change it only to audition a different burst.
 */
function shot({ name = '', ms, from, to, curve = 1, square = 0.5, noise = 0, cutoff = 0.35, peak = 0.5, detune = 0, ring = 0, ringMix = 0.35, loudness = 0, seed = 1 }) {
  const n = Math.floor((ms / 1000) * RATE);
  const out = new Float64Array(n);
  const rand = rng(seed);
  let phase = 0;
  let phase2 = 0;
  let ringPhase = 0;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const freq = to + (from - to) * Math.pow(1 - t, curve);
    phase += (2 * Math.PI * freq) / RATE;
    phase2 += (2 * Math.PI * (freq + detune)) / RATE;
    ringPhase += (2 * Math.PI * ring) / RATE;

    // Summed before the waveshaper rather than after: letting the pair beat
    // *into* tanh means the drive rises and falls with the beat, so the
    // shimmer moves the harmonics and not just the level. Costs nothing.
    const sine = detune ? (Math.sin(phase) + Math.sin(phase2)) * 0.5 : Math.sin(phase);
    // Soft-clipped sine rather than a hard square: same buzz, far less
    // aliasing at these frequencies, and it stays pleasant at high fire rates.
    const buzz = Math.tanh(sine * 3.2) / Math.tanh(3.2);
    let v = sine * (1 - square) + buzz * square;
    // Ring-mods the shaped tone but NOT the noise burst below, which is the
    // attack transient — multiplying that only thins the snap. Cosine so the
    // modulator sits at full swing on sample 0; a sine starts at zero and
    // fades the first millisecond of the attack, which is the millisecond that
    // sells the shot.
    if (ring) v = v * (1 - ringMix) + v * Math.cos(ringPhase) * ringMix;
    if (noise) v += (rand() * 2 - 1) * noise * Math.pow(1 - t, 6); // attack snap only

    // 3 ms attack removes the click; exponential decay keeps it dry.
    const attack = Math.min(1, i / (0.003 * RATE));
    v *= attack * Math.exp(-4.2 * t);

    lp += (v - lp) * cutoff; // one-pole lowpass — takes the harshness off
    out[i] = lp;
  }
  return normalise(out, { peak, loudness, label: name });
}

// One voice per gun, and NONE for the default.
//
// The default 'single' is deliberately silent. It is the gun you hold most of
// the run and it fires several times a second, so it is the one weapon whose
// sound you would hear tens of thousands of times — and a sound at that
// repetition rate can only ever become something you want to switch off. Its
// silence also buys the other four something no amount of mixing could: a
// picked-up gun ANNOUNCES itself, because the soundtrack of your firing
// actually changes when you grab one. Silence is the baseline that makes the
// rest of the weapon board legible.
//
// EVERY fundamental here sits above ~600 Hz, and that is not a stylistic
// choice. A phone speaker is a few millimetres across and rolls off steeply
// below ~500 Hz; the previous bomb voice swept 320 Hz down to 90 Hz, which
// measured perfectly and was literally inaudible on the target device. Weight
// has to be carried by DRIVE, NOISE and RING here, never by pitch — reach for
// a low fundamental and you are mixing for headphones nobody is wearing.
const VOICES = {
  // DOUBLE — two barrels. A single blip widened by a hard detune, so the pair
  // reads as one weapon firing twice over rather than as two guns; the beating
  // is the "doubled" cue and costs no extra length.
  'shot_double.wav': { ms: 80, from: 1180, to: 760, curve: 1.6, square: 0.55, noise: 0.2, peak: 0.85, loudness: 0.132, detune: 34, ring: 240, ringMix: 0.24 },

  // LASER — brighter and steadier: a beam holds its pitch rather than falling
  // away, which is what makes it read as continuous. It also holds still long
  // enough for the ear to resolve the ring sidebands, so it gets the deepest
  // ring setting on the board. Unchanged — this is the one voice already
  // confirmed audible on device, and it is the reference the others are tuned
  // against.
  'shot_laser.wav': { ms: 105, from: 1250, to: 780, curve: 0.8, square: 0.7, cutoff: 0.5, peak: 0.85, loudness: 0.132, detune: 38, ring: 410, ringMix: 0.45 },

  // BOMB — a lob. Blunt and heavy, but heavy WITHOUT going low: the drive is
  // near-square, the noise burst is the largest of the four, and the ring sits
  // under the carrier so its sidebands fold into a growl. The fall is short
  // (760 -> 620) because the weight is in the timbre, not the sweep.
  'shot_bomb.wav': { ms: 115, from: 760, to: 620, curve: 2.2, square: 0.8, noise: 0.4, cutoff: 0.3, peak: 0.85, loudness: 0.15, detune: 18, ring: 155, ringMix: 0.3 },

  // HOMING — the only shot that RISES. Every other weapon falls, because a
  // falling pitch reads as something departing; a homing round is not leaving,
  // it is seeking, and a rising sweep is the cheapest way to say "this one is
  // going to find you". The wide detune gives it the unsettled wobble of
  // something still looking.
  'shot_homing.wav': { ms: 95, from: 880, to: 1480, curve: 1.1, square: 0.45, noise: 0.12, cutoff: 0.5, peak: 0.85, loudness: 0.128, detune: 30, ring: 330, ringMix: 0.3 },
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, params] of Object.entries(VOICES)) {
  // Voices hold parameters rather than rendered samples so the seed can be
  // derived here, from the name each one is about to be written under.
  const samples = shot({ name, seed: hash(name), ...params });
  const buf = wav(samples);
  writeFileSync(join(OUT_DIR, name), buf);
  console.log(`${name.padEnd(16)} ${(samples.length / RATE * 1000).toFixed(0)}ms  ${(buf.length / 1024).toFixed(1)}KB`);
}
