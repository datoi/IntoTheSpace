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

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');
const RATE = 44100;

/** 16-bit mono PCM WAV. */
function wav(samples) {
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
 * One shot.
 *
 * A pitch sweep is what makes a blip read as a SHOT rather than a beep — the
 * ear hears falling pitch as something departing. `curve` shapes that fall:
 * >1 drops fast then settles (snappier), <1 glides.
 */
function shot({ ms, from, to, curve = 1, square = 0.5, noise = 0, cutoff = 0.35, peak = 0.5 }) {
  const n = Math.floor((ms / 1000) * RATE);
  const out = new Float64Array(n);
  let phase = 0;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const freq = to + (from - to) * Math.pow(1 - t, curve);
    phase += (2 * Math.PI * freq) / RATE;

    const sine = Math.sin(phase);
    // Soft-clipped sine rather than a hard square: same buzz, far less
    // aliasing at these frequencies, and it stays pleasant at high fire rates.
    const buzz = Math.tanh(sine * 3.2) / Math.tanh(3.2);
    let v = sine * (1 - square) + buzz * square;
    if (noise) v += (Math.random() * 2 - 1) * noise * Math.pow(1 - t, 6); // attack snap only

    // 3 ms attack removes the click; exponential decay keeps it dry.
    const attack = Math.min(1, i / (0.003 * RATE));
    v *= attack * Math.exp(-4.2 * t);

    lp += (v - lp) * cutoff; // one-pole lowpass — takes the harshness off
    out[i] = lp;
  }
  const max = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  return Array.from(out, (v) => (v / max) * peak);
}

const VOICES = {
  // The default plasma bolt: a tight descending blip.
  'shot.wav': shot({ ms: 85, from: 920, to: 300, curve: 1.6, square: 0.55, noise: 0.25, peak: 0.5 }),
  // Laser: brighter and steadier — a beam holds its pitch rather than falling
  // away, which is what makes it read as a continuous weapon.
  'shot_laser.wav': shot({ ms: 105, from: 1250, to: 780, curve: 0.8, square: 0.7, cutoff: 0.5, peak: 0.45 }),
  // Bomb: a low, blunt thump. Nothing bright in it, so a lob never gets
  // confused with a bolt.
  'shot_bomb.wav': shot({ ms: 110, from: 320, to: 90, curve: 2.2, square: 0.35, noise: 0.35, cutoff: 0.18, peak: 0.6 }),
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, samples] of Object.entries(VOICES)) {
  const buf = wav(samples);
  writeFileSync(join(OUT_DIR, name), buf);
  console.log(`${name.padEnd(16)} ${(samples.length / RATE * 1000).toFixed(0)}ms  ${(buf.length / 1024).toFixed(1)}KB`);
}
