import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { initSounds, play, playPop } from '../sounds';

const mockCreate = createAudioPlayer as jest.Mock;
const mockSetMode = setAudioModeAsync as jest.Mock;

// sounds.ts keeps module state (ready flag + players), so tests share one
// initialized module; order-independent assertions only.

describe('initSounds', () => {
  it('configures silent-mode playback and creates one player per effect', async () => {
    await initSounds();
    expect(mockSetMode).toHaveBeenCalledWith({ playsInSilentMode: true });
    // 5 combo pops + buzz, ding, whoosh, gameover
    expect(mockCreate).toHaveBeenCalledTimes(9);
  });

  it('is idempotent — a second init creates no extra players', async () => {
    await initSounds();
    await initSounds();
    expect(mockCreate).toHaveBeenCalledTimes(9);
  });
});

describe('play', () => {
  beforeAll(() => initSounds());

  const playerFor = (call: number) => mockCreate.mock.results[call].value;

  it('seeks to 0, sets volume, and plays the named effect', () => {
    // buzz is the 6th source (index 5) in declaration order.
    const buzz = playerFor(5);
    play('buzz', 0.7);
    expect(buzz.volume).toBe(0.7);
    expect(buzz.seekTo).toHaveBeenCalledWith(0);
    expect(buzz.play).toHaveBeenCalled();
  });

  it('defaults volume to 1', () => {
    const ding = playerFor(6);
    play('ding');
    expect(ding.volume).toBe(1);
  });

  it('survives a player that throws mid-playback', () => {
    const whoosh = playerFor(7);
    whoosh.play.mockImplementationOnce(() => {
      throw new Error('audio session lost');
    });
    expect(() => play('whoosh')).not.toThrow();
  });
});

describe('playPop', () => {
  beforeAll(() => initSounds());

  const popPlayer = (n: number) => mockCreate.mock.results[n - 1].value; // pop1..pop5 are calls 0..4

  beforeEach(() => {
    for (let n = 1; n <= 5; n++) popPlayer(n).play.mockClear();
  });

  it('plays the matching pitched pop for combos 1-5', () => {
    for (let combo = 1; combo <= 5; combo++) {
      playPop(combo);
      expect(popPlayer(combo).play).toHaveBeenCalledTimes(1);
    }
  });

  it('clamps combo 0 and negatives up to pop1', () => {
    playPop(0);
    playPop(-3);
    expect(popPlayer(1).play).toHaveBeenCalledTimes(2);
  });

  it('clamps combos above 5 down to pop5', () => {
    playPop(6);
    playPop(99);
    expect(popPlayer(5).play).toHaveBeenCalledTimes(2);
  });

  it('plays pops at 0.9 volume', () => {
    playPop(2);
    expect(popPlayer(2).volume).toBe(0.9);
  });
});
