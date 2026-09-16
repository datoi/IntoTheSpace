import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guards the shipped generated audio — `scripts/make-shot-sfx.mjs`,
 * `scripts/make-pickup-sfx.mjs`, `scripts/make-system-sfx.mjs` and
 * `scripts/make-ui-sfx.mjs`.
 *
 * The gun was silent once already (playShot() borrowed `whoosh` at volume
 * 0.1), and both generators now carry a `ringMix` lever that costs RMS at a
 * fixed peak: the modulator drags the waveform to (1 - 2*ringMix) of full
 * swing at its troughs. Retuning it without a matching `loudness` makes a
 * voice quietly disappear, and nothing about that fails loudly. It still
 * plays, the file is still there, the suite still passes — you just stop
 * hearing it.
 *
 * These assert the shipped BYTES, not the generators, so they fail whether the
 * cause was a bad retune or a stale checked-in asset nobody regenerated.
 */

const SOUNDS = join(__dirname, '..', '..', '..', 'assets', 'sounds');

interface Voice {
  /** Target RMS — must track `loudness` in the generating script. */
  rms: number;
  /** Upper bound on length, in seconds. */
  maxSec: number;
}

// Guns are texture under the kill ladder and retrigger several times a second,
// so they are held short and quiet. Pickups are sparse rewards that sit above
// the shot bed, so they run longer and louder.
const VOICES: Record<string, Voice> = {
  // No 'shot.wav': the default gun is silent by design (see SHOT_VOICE).
  'shot_double.wav': { rms: 0.132, maxSec: 0.12 },
  'shot_laser.wav': { rms: 0.132, maxSec: 0.12 },
  'shot_bomb.wav': { rms: 0.15, maxSec: 0.12 },
  'shot_homing.wav': { rms: 0.128, maxSec: 0.12 },
  'pickup_coin.wav': { rms: 0.165, maxSec: 0.3 },
  'pickup_vital.wav': { rms: 0.175, maxSec: 0.3 },
  'pickup_shield.wav': { rms: 0.17, maxSec: 0.3 },
  'pickup_power.wav': { rms: 0.18, maxSec: 0.3 },
  'pickup_control.wav': { rms: 0.17, maxSec: 0.3 },
  'pickup_charge.wav': { rms: 0.153, maxSec: 0.3 },
  'pickup_gift.wav': { rms: 0.185, maxSec: 0.3 },
  // System events annotate the action rather than being it, so they sit under
  // the kill ladder (pop RMS ~0.225). sys_special is the exception: it is the
  // biggest moment the player can cause.
  'sys_arm.wav': { rms: 0.155, maxSec: 0.35 },
  'sys_block.wav': { rms: 0.147, maxSec: 0.15 },
  'sys_chain.wav': { rms: 0.13, maxSec: 0.15 },
  'sys_special.wav': { rms: 0.195, maxSec: 0.35 },
  'sys_wave.wav': { rms: 0.17, maxSec: 0.35 },
  // Interface. The tap is the quietest voice on any board and the shortest:
  // it plays on every press of every screen, so its budget is set by
  // repetition rather than by importance. Confirm and deny are one-per-
  // transaction and can afford to be heard.
  'ui_tap.wav': { rms: 0.098, maxSec: 0.07 },
  'ui_confirm.wav': { rms: 0.142, maxSec: 0.2 },
  'ui_deny.wav': { rms: 0.128, maxSec: 0.2 },
};

interface Wav {
  channels: number;
  rate: number;
  bits: number;
  samples: Float64Array;
}

function readWav(name: string): Wav {
  const b = readFileSync(join(SOUNDS, name));
  const n = (b.length - 44) / 2;
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) samples[i] = b.readInt16LE(44 + i * 2) / 32768;
  return { channels: b.readUInt16LE(22), rate: b.readUInt32LE(24), bits: b.readUInt16LE(34), samples };
}

describe.each(Object.entries(VOICES))('%s', (name, target) => {
  const wav = readWav(name);
  const peak = wav.samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const rms = Math.sqrt(wav.samples.reduce((s, v) => s + v * v, 0) / wav.samples.length);

  it('is 16-bit mono at the rate sounds.ts expects', () => {
    expect(wav.channels).toBe(1);
    expect(wav.bits).toBe(16);
    expect(wav.rate).toBe(44100);
  });

  it('stays inside its length budget', () => {
    expect(wav.samples.length / wav.rate).toBeLessThan(target.maxSec);
  });

  it('is loudness-matched to its target', () => {
    // ±0.5 dB. Wide enough for a deliberate retune of timbre, tight enough to
    // catch modulation being raised without compensating `loudness`.
    const db = 20 * Math.log10(rms / target.rms);
    expect(db).toBeGreaterThan(-0.5);
    expect(db).toBeLessThan(0.5);
  });

  it('leaves headroom rather than clipping in-file', () => {
    expect(peak).toBeLessThan(0.95);
    // A voice that hits its peak ceiling has been asked for more level than
    // its shape can carry, which shows up as the crest factor going flat.
    expect(peak).toBeGreaterThan(rms * 2);
  });

  it('does not start or end on a click', () => {
    // A buffer that begins or ends on a non-zero sample pops. The generators
    // ramp both ends; this catches a retune that outruns the ramp.
    expect(Math.abs(wav.samples[0])).toBeLessThan(0.02);
    expect(Math.abs(wav.samples[wav.samples.length - 1])).toBeLessThan(0.02);
  });
});
