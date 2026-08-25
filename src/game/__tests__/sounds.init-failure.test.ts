/**
 * Failure-path tests for sounds.ts init. The module keeps a `ready` flag,
 * so these use an isolated module registry per test.
 */

describe('initSounds failure handling', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('does not throw when the audio mode cannot be set, and play() stays a no-op', async () => {
    jest.doMock('expo-audio', () => ({
      setAudioModeAsync: jest.fn(() => Promise.reject(new Error('no audio session'))),
      createAudioPlayer: jest.fn(),
    }));
    const sounds = require('../sounds');
    await expect(sounds.initSounds()).resolves.toBeUndefined();
    expect(() => sounds.play('ding')).not.toThrow();
    expect(() => sounds.playPop(3)).not.toThrow();
  });

  it('retries player creation on a later init if the first init failed', async () => {
    const createAudioPlayer = jest.fn(() => ({ volume: 1, play: jest.fn(), seekTo: jest.fn() }));
    const setAudioModeAsync = jest
      .fn()
      .mockRejectedValueOnce(new Error('busy'))
      .mockResolvedValue(undefined);
    jest.doMock('expo-audio', () => ({ setAudioModeAsync, createAudioPlayer }));
    const sounds = require('../sounds');
    await sounds.initSounds(); // fails silently, ready stays false
    expect(createAudioPlayer).not.toHaveBeenCalled();
    await sounds.initSounds(); // succeeds this time
    // Derived from the real sound board, so adding an effect doesn't fail here.
    expect(createAudioPlayer).toHaveBeenCalledTimes(sounds.SOUND_NAMES.length);
    expect(() => sounds.play('ding')).not.toThrow();
  });

  it('play() before any init is a silent no-op', () => {
    jest.doMock('expo-audio', () => ({
      setAudioModeAsync: jest.fn(() => Promise.resolve()),
      createAudioPlayer: jest.fn(),
    }));
    const sounds = require('../sounds');
    expect(() => sounds.play('gameover')).not.toThrow();
  });
});

/**
 * Regression tests for the two ways this module used to turn one local problem
 * into a silent game.
 *
 * Both were reported as "there is no sound except the enemy destroying sound",
 * which is the shape the first bug takes: players are created in declaration
 * order and the pops are declared first, so a single unloadable asset left the
 * kills audible and killed everything after it.
 */
describe('one broken thing does not silence the board', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  const mkPlayer = () => ({ volume: 1, playbackRate: 1, shouldCorrectPitch: true, play: jest.fn(), seekTo: jest.fn() });

  it('keeps loading the rest of the board when one asset fails', async () => {
    let calls = 0;
    const createAudioPlayer = jest.fn(() => {
      calls += 1;
      if (calls === 6) throw new Error('asset not bundled');
      return mkPlayer();
    });
    jest.doMock('expo-audio', () => ({
      setAudioModeAsync: jest.fn(() => Promise.resolve()),
      createAudioPlayer,
    }));
    const sounds = require('../sounds');
    await sounds.initSounds();
    // Every source is still attempted, not abandoned at the failure.
    expect(createAudioPlayer).toHaveBeenCalledTimes(sounds.SOUND_NAMES.length);

    // And a voice declared AFTER the broken one still plays.
    const lastName = sounds.SOUND_NAMES[sounds.SOUND_NAMES.length - 1];
    const lastPlayer = createAudioPlayer.mock.results[sounds.SOUND_NAMES.length - 1].value;
    sounds.play(lastName, 1);
    expect(lastPlayer.play).toHaveBeenCalled();
  });

  it('still plays a pickup when the platform rejects the pitch setters', async () => {
    // A player whose rate setters throw — the portability hazard playPitched
    // has to survive. The voice should sound at its baked pitch, not go quiet.
    const players: any[] = [];
    const createAudioPlayer = jest.fn(() => {
      const p = {
        volume: 1,
        play: jest.fn(),
        seekTo: jest.fn(),
        set shouldCorrectPitch(_v: boolean) {
          throw new Error('unsupported on this platform');
        },
        set playbackRate(_v: number) {
          throw new Error('unsupported on this platform');
        },
      };
      players.push(p);
      return p;
    });
    jest.doMock('expo-audio', () => ({
      setAudioModeAsync: jest.fn(() => Promise.resolve()),
      createAudioPlayer,
    }));
    const sounds = require('../sounds');
    await sounds.initSounds();

    const idx = sounds.SOUND_NAMES.indexOf('pickup_coin');
    expect(() => sounds.playPickup('coin')).not.toThrow();
    expect(players[idx].play).toHaveBeenCalled();

    const sysIdx = sounds.SOUND_NAMES.indexOf('sys_block');
    expect(() => sounds.playSystem('reflect')).not.toThrow();
    expect(players[sysIdx].play).toHaveBeenCalled();
  });
});
