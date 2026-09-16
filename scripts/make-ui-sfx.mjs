// Synthesise the interface sounds — the SHELL talking back to the player's
// finger, as opposed to the game talking about a run.
//
// The menus were silent. That is not a neutral state on mobile: a tap with no
// audible acknowledgement reads as "did that register?", and the player's
// answer is to tap again. Every other board in this game exists because an
// event needed a voice; the interface is the last one that had none.
//
// Run:  node scripts/make-ui-sfx.mjs
//
// Design constraints, in order of importance:
//  - MUST NOT BORROW A GAMEPLAY VOICE. The pickup board owns "rising = you
//    gained something" and the pops own the kill ladder. A menu that clicks
//    with a pickup's voice teaches the player a word that means two things.
//    These are drier, shorter and lower than anything in the run.
//  - THE TAP IS HEARD TENS OF THOUSANDS OF TIMES. It gets the same treatment
//    as the gun: quiet, short, and boring on purpose. A menu click with
//    character is a menu click you will hate by day three.
//  - TIERS SHARE A VOICE. Forward and back are one action in two directions,
//    so they are one sample transposed (see UI_VOICE in src/game/sounds.ts)
//    rather than two unrelated sounds — the same rule the system board follows.

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { RATE, wav, hash, tones } from './lib/audio.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

const VOICES = {
  // TAP — the generic press, and the busiest sound in the shell.
  //
  // ONE note, so it has no direction at all. That is the point: forward
  // navigation transposes it up and back transposes it down (UI_VOICE), and a
  // sample that already rose or fell would fight its own transposition. The
  // small noise transient is the finger making contact; the low cutoff keeps
  // it a dry tick rather than a tone you could hum.
  //
  // Quietest voice on any board by a distance. It plays on every press of
  // every screen, and it is furniture, not information.
  'ui_tap.wav': { ms: 52, notes: [523], decay: 16, square: 0.42, noise: 0.34, cutoff: 0.34, loudness: 0.098 },

  // CONFIRM — a purchase, an equip, a reward claimed.
  //
  // The one interface voice allowed to rise, because it is the one that
  // reports a gain. It shares that shape with the pickup board and does NOT
  // share its register or its length: pickups are bright, bell-like and sit
  // above the shot bed, this is lower, blunter and rounder. They also never
  // occur together — pickups only exist inside a run, this only outside one —
  // so context separates them even before timbre does.
  'ui_confirm.wav': { ms: 150, notes: [587, 880], decay: 4.2, square: 0.3, detune: 14, cutoff: 0.4, loudness: 0.142 },

  // DENY — can't afford it, it's locked, it's maxed.
  //
  // Falling, dull and slightly buzzy: the cutoff is the lowest here and the
  // square weight the highest, so it lands as a thud rather than a beep. It
  // must never sting — a player who cannot afford a ship has already had the
  // bad news from the price, and an aggressive error tone would punish them
  // for browsing.
  'ui_deny.wav': { ms: 140, notes: [330, 247], decay: 3.6, square: 0.68, detune: 9, cutoff: 0.26, loudness: 0.128 },
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, params] of Object.entries(VOICES)) {
  const samples = tones({ name, seed: hash(name), ...params });
  const buf = wav(samples);
  writeFileSync(join(OUT_DIR, name), buf);
  console.log(`${name.padEnd(18)} ${((samples.length / RATE) * 1000).toFixed(0)}ms  ${(buf.length / 1024).toFixed(1)}KB`);
}
