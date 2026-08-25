import { readFileSync } from 'fs';
import { join } from 'path';
import { SOUND_NAMES, systemSemitones, pickupSemitones, type SystemEvent, type PickupKind } from '../sounds';

/**
 * Guards the design invariants of the generated sound board, measured from the
 * shipped bytes rather than from the generators' note tables.
 *
 * The invariant that matters is DIRECTION, not frequency. An earlier draft of
 * this file tried to hold every voice a fixed distance from the kill ladder
 * (pop1..pop5), which turned out to be impossible: the ladder is a minor-third
 * stack, so no equal-tempered note between 509 and 1018 Hz can sit more than
 * 1.5 semitones from a rung. It was also the wrong target. What separates a
 * 120 ms static pop from a 200 ms rising two-note figure is its SHAPE; a
 * shared fundamental between sounds that different is not a confusion the ear
 * actually makes.
 *
 * So what is asserted here is the vocabulary itself:
 *   • pickups rise, because rising reads as gained;
 *   • a defensive save falls, because it is not a gain;
 *   • the chain callout clears the ladder, because it is the one voice that
 *     fires while the ladder is running;
 *   • every voice is long enough for its shape to be heard as one.
 *
 * One trap worth naming: the original assets (pops, buzz, whoosh, gameover)
 * are 22.05 kHz files while every generated voice is 44.1 kHz. Analysing a pop
 * at 44.1 reads it exactly one octave high, which is how the ladder came to be
 * mistaken for 1034-2089 Hz. Always take the rate from the file header.
 */

const SOUNDS = join(__dirname, '..', '..', '..', 'assets', 'sounds');

function samplesOf(name: string): { rate: number; data: Float64Array } {
  const b = readFileSync(join(SOUNDS, `${name}.wav`));
  const n = (b.length - 44) / 2;
  const data = new Float64Array(n);
  for (let i = 0; i < n; i++) data[i] = b.readInt16LE(44 + i * 2) / 32768;
  return { rate: b.readUInt32LE(24), data };
}

/**
 * Dominant frequency of a window, at semitone resolution.
 *
 * Goertzel over a QUARTER-TONE candidate set rather than an FFT: an FFT's
 * linear bins are far too coarse down at 400 Hz (a 43 Hz bin is nearly two
 * semitones there), and evaluating a few hundred candidates costs O(n) each,
 * which is nothing at these lengths.
 *
 * The grid has to be finer than a semitone. At semitone spacing a partial
 * landing between two candidates splits its energy across both and can lose to
 * a weaker partial that happens to sit on a candidate — which is exactly how
 * pickup_control's 831 Hz carrier (straddled by 807 and 855) was read as its
 * own 605 Hz sideband, and the voice was wrongly reported as falling.
 */
function dominantHz(data: Float64Array, from: number, len: number, rate: number): number {
  let best = 0;
  let bestMag = -1;
  const end = Math.min(from + len, data.length);
  for (let k = 0; k <= 320; k++) {
    const f = 120 * Math.pow(2, k / 48);
    const coeff = 2 * Math.cos((2 * Math.PI * f) / rate);
    let s1 = 0;
    let s2 = 0;
    for (let i = from; i < end; i++) {
      const s0 = data[i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    const mag = s1 * s1 + s2 * s2 - coeff * s1 * s2;
    if (mag > bestMag) {
      bestMag = mag;
      best = f;
    }
  }
  return best;
}

/** Fundamental of the first and last note of a voice, plus its length. */
function endpoints(name: string): { first: number; last: number; seconds: number } {
  const { rate, data } = samplesOf(name);
  // Short enough to sit inside one note, and taken at 70% for the tail so it
  // catches the final note's onset rather than the silence it decays into.
  const win = Math.min(Math.floor(rate * 0.04), Math.floor(data.length * 0.25));
  return {
    first: dominantHz(data, 0, win, rate),
    last: dominantHz(data, Math.floor(data.length * 0.7), win, rate),
    seconds: data.length / rate,
  };
}

const semisApart = (a: number, b: number) => 12 * Math.log2(a / b);

const POPS = ['pop1', 'pop2', 'pop3', 'pop4', 'pop5'];
// Measured, not hardcoded, so the guard follows the pops if they change.
const LADDER = POPS.map((n) => endpoints(n).first);

const PICKUP_VOICES = [
  'pickup_coin',
  'pickup_vital',
  'pickup_shield',
  'pickup_power',
  'pickup_control',
  'pickup_charge',
  'pickup_gift',
];
const SYSTEM_VOICES = ['sys_arm', 'sys_block', 'sys_chain', 'sys_special', 'sys_wave'];
const SHOT_VOICES = ['shot_double', 'shot_laser', 'shot_bomb', 'shot_homing'];

/**
 * The lowest fundamental a phone speaker can actually reproduce.
 *
 * This is the invariant that cost the most to learn. A handset speaker is a
 * few millimetres across and rolls off steeply below ~500 Hz, so a voice
 * written under that measures perfectly on every meter and is SILENT on the
 * target device. It shipped exactly that way: shot_bomb swept 320 Hz down to
 * 90, sys_special sat at 165, and the bug was reported as "there is no sound"
 * — with nothing wrong in any log, because nothing was wrong except the
 * register. Weight belongs in drive, noise and ring, never in pitch.
 */
const SPEAKER_FLOOR_HZ = 600;

const SYSTEM_EVENTS: SystemEvent[] = [
  'armed',
  'overcharged',
  'chain',
  'block',
  'reflect',
  'special',
  'specialOver',
  'waveClear',
];

const PICKUP_KINDS: PickupKind[] = [
  'coin', 'magnet', 'doubleCoins', 'luckyDrop', 'heart', 'repair', 'extraHeart',
  'shield', 'damageBoost', 'fireBoost', 'nuke', 'bombPack', 'freeze', 'slowmo',
  'energy', 'gift',
];

describe('sound board', () => {
  it('measured the kill ladder at the pops own sample rate', () => {
    // Sanity check on the detector. The pops are 22.05 kHz files; if this ever
    // comes back near 1034-2089 Hz the rate is being ignored and every reading
    // below is an octave out.
    expect(LADDER).toHaveLength(5);
    for (let i = 1; i < LADDER.length; i++) expect(LADDER[i]).toBeGreaterThan(LADDER[i - 1]);
    expect(LADDER[0]).toBeLessThan(600);
    expect(LADDER[4]).toBeLessThan(1100);
  });

  it('names only voices that exist on the board', () => {
    for (const v of [...PICKUP_VOICES, ...SYSTEM_VOICES]) expect(SOUND_NAMES).toContain(v);
  });

  it('gives every voice enough length for its shape to read', () => {
    // These are multi-note figures, and an interval needs time to be heard as
    // one. 100 ms is the floor; sys_block sits just above it on purpose,
    // because it can fire several times inside a single enemy burst.
    for (const v of [...PICKUP_VOICES, ...SYSTEM_VOICES]) {
      const s = endpoints(v).seconds;
      expect(`${v} ${s.toFixed(3)}s`).toBe(
        s >= 0.1 ? `${v} ${s.toFixed(3)}s` : `${v} too short for a shape (${s.toFixed(3)}s)`
      );
    }
  });
});

describe.each([...PICKUP_VOICES, ...SYSTEM_VOICES, ...SHOT_VOICES])('%s', (voice) => {
  it('stays above the phone-speaker floor', () => {
    const { first, last } = endpoints(voice);
    const lowest = Math.min(first, last);
    expect(`${voice} lowest ${lowest.toFixed(0)}Hz`).toBe(
      lowest >= SPEAKER_FLOOR_HZ
        ? `${voice} lowest ${lowest.toFixed(0)}Hz`
        : `${voice} sits below ${SPEAKER_FLOOR_HZ}Hz and will be inaudible on a handset`
    );
  });
});

describe.each(PICKUP_VOICES)('%s', (voice) => {
  it('rises, because rising is what reads as gained', () => {
    const { first, last } = endpoints(voice);
    const move = semisApart(last, first);
    // A whole tone at minimum — enough that the interval is heard as a move
    // rather than as a wobble.
    expect(`${voice} ${first.toFixed(0)}->${last.toFixed(0)}Hz`).toBe(
      move >= 2
        ? `${voice} ${first.toFixed(0)}->${last.toFixed(0)}Hz`
        : `${voice} must RISE by >=2st (got ${move.toFixed(1)}st)`
    );
  });
});

describe('system voices speak a different shape from pickups', () => {
  it('sys_block falls — a save is not a gain', () => {
    const { first, last } = endpoints('sys_block');
    const move = semisApart(last, first);
    expect(`sys_block ${first.toFixed(0)}->${last.toFixed(0)}Hz`).toBe(
      move <= -2
        ? `sys_block ${first.toFixed(0)}->${last.toFixed(0)}Hz`
        : `sys_block must FALL by >=2st (got ${move.toFixed(1)}st)`
    );
  });

  it('sys_chain clears the kill ladder it fires alongside', () => {
    // The only voice that plays WHILE the ladder is running, so it is the one
    // place register separation is worth buying — and unlike the rest of the
    // board it is achievable, because nothing forces a callout to be low.
    const { first } = endpoints('sys_chain');
    const above = semisApart(first, LADDER[LADDER.length - 1]);
    expect(`sys_chain ${first.toFixed(0)}Hz, ${above.toFixed(1)}st above the ladder`).toBe(
      above >= 4
        ? `sys_chain ${first.toFixed(0)}Hz, ${above.toFixed(1)}st above the ladder`
        : `sys_chain must sit >=4st above the ladder top (got ${above.toFixed(1)}st)`
    );
  });
});

describe('playback transposition', () => {
  it('keeps every event inside the rate range expo-audio supports', () => {
    for (const k of PICKUP_KINDS) {
      const rate = Math.pow(2, pickupSemitones(k) / 12);
      expect(rate).toBeGreaterThanOrEqual(0.5);
      expect(rate).toBeLessThanOrEqual(2);
    }
    for (const e of SYSTEM_EVENTS) {
      const rate = Math.pow(2, systemSemitones(e) / 12);
      expect(rate).toBeGreaterThanOrEqual(0.5);
      expect(rate).toBeLessThanOrEqual(2);
    }
  });
});
