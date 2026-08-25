// Synthesise the system-event sounds — the game talking to the player about
// STATE, as opposed to shots (what you did) and pickups (what you got).
//
// All seven of these events shared one `ding`, separated only by volume:
// special armed, overcharged, chain milestone, shield absorb, bulwark reflect,
// special activation and the wave-clear payout. Volume is not a distinguishing
// dimension — a quieter version of a sound is the same sound — so in practice
// the game had one word for seven sentences. The costly one was the shield
// absorb: a defensive SAVE and a coin pickup are different enough events that
// sharing a voice loses you real information in the middle of a fight.
//
// Run:  node scripts/make-system-sfx.mjs
//
// Design constraints, in order of importance:
//  - NOT CONFUSABLE WITH A PICKUP. Every pickup voice rises, because rising
//    reads as gained. So the voices here that are not rewards must NOT rise —
//    a save falls, an alert stays level. This is the single most important
//    line in this file: it is what stops the board turning back into mush.
//  - UNDER THE ACTION. These annotate; they never mask the kill-pitch ladder
//    or the gun. Only the special activation is allowed to be the loudest
//    thing on screen, because it is.
//  - TIERS SHARE A VOICE. Armed/overcharged and absorb/reflect are the same
//    event at two intensities, so they are one sample transposed (see
//    SYSTEM_PITCH in src/game/sounds.ts) rather than two unrelated sounds.

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { RATE, wav, hash, tones } from './lib/audio.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

const VOICES = {
  // ARMED / OVERCHARGED — the special meter filling.
  // A held, synthetic two-tone rise. It rises because arming IS a gain, but
  // the heavy square and wide detune keep it reading as machinery coming
  // online rather than as something collected. Overcharged is this same voice
  // transposed up, so the second tier is audibly the same system, louder.
  'sys_arm.wav': { ms: 220, notes: [784, 1175], decay: 2.4, square: 0.62, detune: 30, cutoff: 0.42, loudness: 0.155 },

  // ABSORB / REFLECT — a hit that did not land.
  // FALLING, and the only voice here with a noise transient. A save is an
  // impact: something hard met something hard and the hit went away. The ring
  // is set high to put a metallic edge on it, so it reads as armour rather
  // than as a hurt. Short, because bulwark reflect can fire several times in a
  // burst and this must never become a rattle.
  'sys_block.wav': { ms: 120, notes: [1046, 698], decay: 5.5, square: 0.55, noise: 0.28, ring: 640, ringMix: 0.34, cutoff: 0.5, loudness: 0.147 },

  // CHAIN MILESTONE — a callout, not a reward.
  // The thinnest and highest voice on the whole board, and deliberately so: it
  // fires while the kill-pitch ladder is running, and the ladder is the sound
  // that carries information. This sits ABOVE it in register so the two can be
  // told apart without either masking the other. The kill ladder tops out at
  // ~1018 Hz (the pops are 22.05 kHz files — measure them at their own rate,
  // not 44.1, or you will read every pop an octave high), so this clears it by
  // more than half an octave. This is the one voice where register separation
  // is worth buying, because it is the only one that fires WHILE the ladder is
  // running.
  'sys_chain.wav': { ms: 130, notes: [1568, 2093], decay: 7.0, square: 0.3, cutoff: 0.62, loudness: 0.13 },

  // SPECIAL ACTIVATION — the biggest moment the player can cause.
  // The only voice allowed to be low, long and loud. Three notes falling then
  // resolving upward, which is the shape of something winding up and letting
  // go. Layered with `whoosh` at the call site, so it carries the low end and
  // lets the whoosh carry the air.
  'sys_special.wav': { ms: 300, notes: [784, 587, 1175], glide: 0.5, decay: 2.0, square: 0.5, detune: 22, ring: 390, ringMix: 0.3, cutoff: 0.36, loudness: 0.195 },

  // WAVE CLEAR — the ribbon payout.
  // A resolved major triad, slow decay, bell-like. It rises like a pickup, but
  // it is longer and more musical than any of them, which is what separates
  // "a wave ended and paid you" from "you grabbed something".
  'sys_wave.wav': { ms: 320, notes: [784, 988, 1175], decay: 2.2, square: 0.2, cutoff: 0.34, loudness: 0.17 },
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, params] of Object.entries(VOICES)) {
  const samples = tones({ name, seed: hash(name), ...params });
  const buf = wav(samples);
  writeFileSync(join(OUT_DIR, name), buf);
  console.log(`${name.padEnd(18)} ${((samples.length / RATE) * 1000).toFixed(0)}ms  ${(buf.length / 1024).toFixed(1)}KB`);
}
