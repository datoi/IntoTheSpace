import { createAudioPlayer } from 'expo-audio';
import {
  SAMPLE_MIN_GAP_MS,
  SOUND_NAMES,
  initSounds,
  play,
  playKill,
  resetSoundBudget,
} from '../sounds';

/**
 * The per-sample audio budget, and the audio-session options.
 *
 * Both exist for the same measured bug: the game stuttered continuously on
 * device — frames of 150–370ms with an almost empty board — and muting the
 * effects channel made every spike disappear. Two causes, one symptom:
 *
 *   1. `keepAudioSessionActive` defaults to FALSE in expo-audio, so every
 *      finished effect scheduled `AVAudioSession.setActive(false, …)` while
 *      every `play()` called `setActive(true)`. A game firing short sounds
 *      continuously thrashed the iOS audio session dozens of times a second.
 *   2. Nothing throttled the KILL path, so a detonation resolving a full board
 *      hammered ONE player with a dozen seekTo/play pairs in a single tick.
 *
 * These tests assert the BOUNDED WORK, not the live entity caps — the caps
 * bound what is on screen and never bounded what one tick does, which is
 * exactly why they never prevented any of this.
 */

const mockCreate = createAudioPlayer as jest.Mock;

const playerFor = (name: (typeof SOUND_NAMES)[number]) =>
  mockCreate.mock.results[SOUND_NAMES.indexOf(name)].value;

beforeAll(() => initSounds());

describe('audio session options', () => {
  it('holds the audio session open for every player on the board', () => {
    // The whole board, not a sample of it: one player created without this
    // would be enough to reintroduce the session thrash.
    expect(mockCreate).toHaveBeenCalledTimes(SOUND_NAMES.length);
    for (const call of mockCreate.mock.calls) {
      expect(call[1]).toEqual(
        expect.objectContaining({ keepAudioSessionActive: true })
      );
    }
  });

  it('does not leave players polling playback status at the default rate', () => {
    // Nothing in the game reads playback status, so the default 500ms poll was
    // pure bridge traffic across the whole board.
    for (const call of mockCreate.mock.calls) {
      expect(call[1].updateInterval).toBeGreaterThanOrEqual(10_000);
    }
  });
});

describe('the per-sample budget', () => {
  let now = 0;
  beforeEach(() => {
    now = 10_000;
    resetSoundBudget(() => now);
    for (const name of SOUND_NAMES) playerFor(name).play.mockClear();
  });

  it('collapses a same-tick burst on one sample to a single native start', () => {
    const pop = playerFor('pop1');
    // Twelve kills resolving in ONE synchronous pass, all at a low chain, so
    // playKill maps every one of them to pop1 — the exact shape of a nuke.
    for (let i = 0; i < 12; i++) playKill(1);
    expect(pop.play).toHaveBeenCalledTimes(1);
  });

  it('bounds a full detonation to one start per distinct sample', () => {
    // A detonation is a burst of kills plus its own two sounds. Whatever the
    // enemy count, the native call count is bounded by the number of DISTINCT
    // samples involved, never by how many enemies died.
    for (let i = 0; i < 12; i++) playKill(1);
    play('whoosh', 1);
    play('buzz', 0.6);
    const starts = SOUND_NAMES.reduce(
      (n, name) => n + playerFor(name).play.mock.calls.length,
      0
    );
    expect(starts).toBe(3);
  });

  it('keeps distinct samples independent — one does not mute another', () => {
    play('pop1', 0.9);
    play('buzz', 0.6);
    expect(playerFor('pop1').play).toHaveBeenCalledTimes(1);
    expect(playerFor('buzz').play).toHaveBeenCalledTimes(1);
  });

  it('lets the same sample through again once the window has passed', () => {
    play('pop1', 0.9);
    now += SAMPLE_MIN_GAP_MS;
    play('pop1', 0.9);
    expect(playerFor('pop1').play).toHaveBeenCalledTimes(2);
  });

  it('is narrow enough that ordinary kills still each sound', () => {
    // A wave's kills are hundreds of ms apart; the chain pitch ladder has to
    // keep reading as a ladder, which is the whole point of the five samples.
    const pop = playerFor('pop1');
    for (let i = 0; i < 5; i++) {
      playKill(1);
      now += 200;
    }
    expect(pop.play).toHaveBeenCalledTimes(5);
  });

  it('suppresses the repeat without seeking or re-voluming the player', () => {
    // A suppressed start must cost NOTHING at the native boundary — a seekTo
    // is a main-thread hop on Android and a Promise on iOS, so leaving those
    // in would keep most of the cost the budget exists to remove.
    const pop = playerFor('pop1');
    play('pop1', 0.9);
    const seeksAfterFirst = pop.seekTo.mock.calls.length;
    play('pop1', 0.9);
    expect(pop.seekTo.mock.calls.length).toBe(seeksAfterFirst);
  });
});
