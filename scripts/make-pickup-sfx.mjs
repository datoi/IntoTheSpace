// Synthesise the pickup sounds — one voice per drop FAMILY.
//
// What was wrong before this existed:
//   • heart played playPop(4) and coin played playPop(2) — the same samples
//     playKill uses to encode the chain multiplier. Collecting a coin sounded
//     exactly like a x3 kill, which corrupts the one readout in the game that
//     tells you how well you are playing.
//   • All 13 boons shared a single `ding`. A screen nuke and a coin magnet
//     were audibly the same event.
//   • The gun drop differed from a boon only by volume (1.0 vs 0.9), which is
//     not a distinguishable dimension.
//
// The fix is NOT sixteen unique jingles. The ear cannot learn sixteen short
// blips, and it does not need to: the badge, the float label and the HUD chip
// already name the pickup. What audio is good at is CATEGORY — telling you
// within 50 ms whether the thing you just grabbed heals, arms, protects or
// pays. So the voices mirror the colour families pickups.ts already defines
// ("families share a hue so the drop reads at a glance"), and the player
// learns one taxonomy instead of two.
//
// Per-KIND variation then comes from a small pitch offset applied at playback
// (see PICKUP_PITCH in src/game/sounds.ts), so Freeze and Slow-Mo are siblings
// rather than strangers, and a new boon costs zero new assets.
//
// Run:  node scripts/make-pickup-sfx.mjs
//
// Design constraints, in order of importance:
//  - RISING. A shot falls because the ear reads falling pitch as departing; a
//    pickup rises because rising reads as GAINED. This is the single strongest
//    cue that something good happened, and it costs nothing.
//  - LOUDER THAN THE GUN, because these are sparse rewards rather than
//    texture. They sit above the shot bed and alongside the kill ladder.
//  - SHORT ENOUGH TO OVERLAP. A pickup often lands in the middle of a kill
//    streak; anything with a tail smears across the kill pitches.

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { RATE, wav, hash, tones } from './lib/audio.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

// One voice per family. The comment on each says what the player should be
// able to tell WITHOUT looking at the screen — that is the whole test of
// whether a voice earns its place.
const VOICES = {
  // ECONOMY (gold) — coin, magnet, doubleCoins, luckyDrop.
  // Bright metallic two-note fourth: the genre's universal "money" signal.
  // Highest and shortest of the set because coins are the most frequent drop
  // and must never outstay their welcome.
  'pickup_coin.wav': { ms: 150, notes: [988, 1319], decay: 6.5, square: 0.5, ring: 520, ringMix: 0.22, cutoff: 0.55, loudness: 0.165 },

  // VITAL (red) — heart, repair, extraHeart.
  // A rising fifth, almost pure sine, no noise and no ring. Deliberately the
  // WARMEST voice in the set: health is the one pickup that should feel like
  // relief rather than acquisition, and any metallic edge undoes that.
  'pickup_vital.wav': { ms: 210, notes: [784, 1175], decay: 3.4, square: 0.12, cutoff: 0.3, loudness: 0.175 },

  // DEFENSIVE (plasma) — shield.
  // A swell rather than a blip: slower decay and a detuned shimmer, so it
  // reads as something CLOSING AROUND YOU instead of something collected.
  'pickup_shield.wav': { ms: 240, notes: [698, 1046], glide: 0.6, decay: 2.6, square: 0.3, detune: 24, ring: 470, ringMix: 0.3, cutoff: 0.38, loudness: 0.17 },

  // OFFENSIVE (amber) — damageBoost, fireBoost, nuke, bombPack.
  // Lowest and hardest: heavy drive, a noise edge, minor-third rise. Sits
  // deliberately close to the gun's frequency range, because these boons are
  // all statements about the gun.
  'pickup_power.wav': { ms: 190, notes: [622, 932], decay: 4.2, square: 0.72, noise: 0.2, cutoff: 0.42, loudness: 0.18 },

  // CONTROL (violet) — freeze, slowmo.
  // The overtly cosmic one. Strong fixed-Hz ring mod puts inharmonic
  // sidebands either side of the carrier, which is what makes it read as
  // "reality just changed" rather than "you picked something up".
  //
  // This is the deepest ringMix on the board, and at this depth the sidebands
  // (831 +/- 233 Hz on the second note) come within striking distance of the
  // carrier's own level. Push it much further and the perceived pitch stops
  // being the note you wrote — so if you raise it, check the voice still reads
  // as RISING; sounds.system.test.ts measures that from the shipped bytes.
  'pickup_control.wav': { ms: 230, notes: [740, 988], glide: 0.5, decay: 3.0, square: 0.4, ring: 277, ringMix: 0.46, cutoff: 0.4, loudness: 0.17 },

  // CHARGE (energy) — energy cell.
  // Three fast rising notes with a wide detune: electrical, urgent, and
  // distinct from coin despite also being bright, because the third note is
  // what separates "topped up" from "collected".
  'pickup_charge.wav': { ms: 200, notes: [784, 1046, 1568], decay: 5.5, square: 0.45, detune: 32, ring: 215, ringMix: 0.2, cutoff: 0.5, loudness: 0.153 },

  // GIFT — the weapon drop. The only three-note octave fanfare, the longest
  // and the loudest, because a new gun is the single most consequential thing
  // the player can pick up and it should be unmistakable.
  'pickup_gift.wav': { ms: 260, notes: [698, 1046, 1397], decay: 3.8, square: 0.5, detune: 18, ring: 465, ringMix: 0.24, cutoff: 0.48, loudness: 0.185 },
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, params] of Object.entries(VOICES)) {
  const samples = tones({ name, seed: hash(name), ...params });
  const buf = wav(samples);
  writeFileSync(join(OUT_DIR, name), buf);
  console.log(`${name.padEnd(20)} ${((samples.length / RATE) * 1000).toFixed(0)}ms  ${(buf.length / 1024).toFixed(1)}KB`);
}
