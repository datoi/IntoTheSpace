import { createAudioPlayer } from 'expo-audio';
import {
  SOUND_NAMES,
  initSounds,
  play,
  playPickup,
  playUi,
  resetUiThrottle,
  uiSemitones,
  type UiEvent,
} from '../sounds';
import { resetMixer, setChannelVolume } from '../mixer';

const mockCreate = createAudioPlayer as jest.Mock;

/**
 * The interface board, and the channel routing that lets a player turn it down
 * without turning the game down.
 *
 * The routing is the part worth guarding. Nothing about a miswired channel
 * fails loudly: the sound still plays, the settings screen still moves, and
 * the only symptom is that one slider quietly governs the wrong family.
 */

const UI_EVENTS: UiEvent[] = ['tap', 'back', 'select', 'confirm', 'deny'];

beforeAll(() => initSounds());

// Players are created in declaration order, so a name's position on the board
// IS its player index — the same derivation sounds.test.ts uses, for the same
// reason: hardcoded indices break the moment an effect is added.
const playerFor = (name: (typeof SOUND_NAMES)[number]) =>
  mockCreate.mock.results[SOUND_NAMES.indexOf(name)].value;

beforeEach(() => {
  resetMixer();
  resetUiThrottle();
  playerFor('ui_tap').play.mockClear();
  playerFor('ui_confirm').play.mockClear();
  playerFor('ui_deny').play.mockClear();
});

afterAll(resetMixer);

describe('the board', () => {
  it('speaks with a voice that is actually bundled', () => {
    for (const name of ['ui_tap', 'ui_confirm', 'ui_deny']) {
      expect(SOUND_NAMES).toContain(name);
    }
  });

  it('plays every event', () => {
    for (const event of UI_EVENTS) {
      resetUiThrottle();
      expect(() => playUi(event)).not.toThrow();
    }
    expect(playerFor('ui_tap').play).toHaveBeenCalled();
    expect(playerFor('ui_confirm').play).toHaveBeenCalled();
    expect(playerFor('ui_deny').play).toHaveBeenCalled();
  });
});

describe('navigation reads as direction', () => {
  it('puts back BELOW forward, and select above it', () => {
    // The three share one sample, so pitch is the only thing separating them.
    // If these ever collapse to the same offset the shell has one word for
    // three sentences again — which is the exact failure the system board was
    // built to avoid.
    expect(uiSemitones('back')).toBeLessThan(uiSemitones('tap'));
    expect(uiSemitones('select')).toBeGreaterThan(uiSemitones('tap'));
  });

  it('transposes the shared sample rather than shipping three of them', () => {
    const tap = playerFor('ui_tap');
    playUi('back');
    expect(tap.playbackRate).toBeCloseTo(Math.pow(2, uiSemitones('back') / 12));
    // Pitch correction must stay off, or the sample plays faster at the SAME
    // pitch and the whole family collapses to one note.
    expect(tap.shouldCorrectPitch).toBe(false);
  });
});

describe('the ui channel', () => {
  it('scales the interface without touching the game', () => {
    const tap = playerFor('ui_tap');
    playUi('tap');
    const full = tap.volume;

    resetUiThrottle();
    setChannelVolume('ui', 0.5);
    playUi('tap');
    expect(tap.volume).toBeCloseTo(full * 0.5);

    // …and the sfx board is unaffected by the ui slider.
    const buzz = playerFor('buzz');
    play('buzz', 0.8);
    expect(buzz.volume).toBeCloseTo(0.8);
  });

  it('does not touch the player at all when muted', () => {
    // A muted channel should cost nothing: no seek, no play, no work per
    // press. Asserting on the calls rather than on volume is what makes that
    // an actual guarantee instead of an inaudible one.
    const tap = playerFor('ui_tap');
    tap.seekTo.mockClear();
    setChannelVolume('ui', 0);
    playUi('tap');
    expect(tap.play).not.toHaveBeenCalled();
    expect(tap.seekTo).not.toHaveBeenCalled();
  });

  it('is not muted by the sfx slider', () => {
    // The whole point of separate channels: a player who silences the game can
    // still hear their own presses.
    const tap = playerFor('ui_tap');
    setChannelVolume('sfx', 0);
    playUi('tap');
    expect(tap.play).toHaveBeenCalled();
  });
});

describe('the sfx channel', () => {
  it('scales every in-run board, pitched voices included', () => {
    const buzz = playerFor('buzz');
    const coin = playerFor('pickup_coin');
    setChannelVolume('sfx', 0.25);
    play('buzz', 0.8);
    playPickup('coin', 0.8);
    expect(buzz.volume).toBeCloseTo(0.2);
    expect(coin.volume).toBeCloseTo(0.2);
  });

  it('silences the game without silencing the shell', () => {
    const buzz = playerFor('buzz');
    buzz.play.mockClear();
    setChannelVolume('sfx', 0);
    play('buzz', 1);
    expect(buzz.play).not.toHaveBeenCalled();
    playUi('tap');
    expect(playerFor('ui_tap').play).toHaveBeenCalled();
  });
});

describe('the throttle', () => {
  it('swallows a duplicate press but not a real second one', () => {
    const tap = playerFor('ui_tap');
    playUi('tap');
    playUi('tap'); // same tick — a nested pressable firing twice
    expect(tap.play).toHaveBeenCalledTimes(1);

    resetUiThrottle();
    playUi('tap');
    expect(tap.play).toHaveBeenCalledTimes(2);
  });
});
