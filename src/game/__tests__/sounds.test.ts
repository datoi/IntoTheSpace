import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { initSounds, play, playPop, playShot, SOUND_NAMES } from '../sounds';

const mockCreate = createAudioPlayer as jest.Mock;
const mockSetMode = setAudioModeAsync as jest.Mock;

// sounds.ts keeps module state (ready flag + players), so tests share one
// initialized module; order-independent assertions only.

describe('initSounds', () => {
  it('configures silent-mode playback and creates one player per effect', async () => {
    await initSounds();
    expect(mockSetMode).toHaveBeenCalledWith({ playsInSilentMode: true });
    // Derived from the real sound board, so adding an effect doesn't fail here.
    expect(mockCreate).toHaveBeenCalledTimes(SOUND_NAMES.length);
  });

  it('is idempotent — a second init creates no extra players', async () => {
    await initSounds();
    await initSounds();
    expect(mockCreate).toHaveBeenCalledTimes(SOUND_NAMES.length);
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

describe('playShot', () => {
  beforeAll(() => initSounds());

  // Voices sit at the end of the board, after the 9 original effects.
  const voice = (name: string) =>
    mockCreate.mock.results[SOUND_NAMES.indexOf(name as never)].value;

  // The throttle is wall-clock based, so drive it from a clock we control.
  // Must be a standalone counter, not `Date.now() + n` — by the second test
  // Date.now is already spied and would just re-read the frozen value.
  let clock = 1_000_000;
  const realNow = Date.now;

  beforeEach(() => {
    for (const n of ['shot', 'shot_laser', 'shot_bomb']) voice(n).play.mockClear();
    clock += 10_000; // well past SHOT_MIN_GAP_MS, so each test starts unthrottled
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
  });

  afterEach(() => {
    Date.now = realNow;
  });

  it('gives the laser and the bomb their own voice', () => {
    playShot('laser');
    expect(voice('shot_laser').play).toHaveBeenCalledTimes(1);
    expect(voice('shot').play).not.toHaveBeenCalled();
  });

  it('falls back to the default bolt for every other gun', () => {
    // 'single', 'double' and 'homing' all fire the same bolt — only the two
    // guns with a genuinely different shape get their own sample.
    playShot('double');
    expect(voice('shot').play).toHaveBeenCalledTimes(1);
  });

  it('is audible — the placeholder played at 0.1 and could not be heard', () => {
    playShot('single');
    expect(voice('shot').volume).toBeGreaterThan(0.25);
  });

  it('throttles a sustained stream so a stacked gun cannot rattle', () => {
    playShot('single');
    playShot('single');
    playShot('single');
    expect(voice('shot').play).toHaveBeenCalledTimes(1);
  });
});
