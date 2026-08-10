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
