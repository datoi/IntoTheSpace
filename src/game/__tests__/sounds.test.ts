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

  // Players are created in declaration order, so a name's position on the board
  // IS its player index. Derived rather than hardcoded: these were fixed numbers
  // until retiring an effect shifted every one of them and quietly pointed each
  // assertion at the wrong player.
  const playerFor = (name: (typeof SOUND_NAMES)[number]) =>
    mockCreate.mock.results[SOUND_NAMES.indexOf(name)].value;

  it('seeks to 0, sets volume, and plays the named effect', () => {
    const buzz = playerFor('buzz');
    play('buzz', 0.7);
    expect(buzz.volume).toBe(0.7);
    expect(buzz.seekTo).toHaveBeenCalledWith(0);
    expect(buzz.play).toHaveBeenCalled();
  });

  it('defaults volume to 1', () => {
    const gameover = playerFor('gameover');
    play('gameover');
    expect(gameover.volume).toBe(1);
  });

  it('survives a player that throws mid-playback', () => {
    const whoosh = playerFor('whoosh');
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
    for (const n of ['shot_double', 'shot_laser', 'shot_bomb', 'shot_homing']) voice(n).play.mockClear();
    clock += 10_000; // well past SHOT_MIN_GAP_MS, so each test starts unthrottled
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
  });

  afterEach(() => {
    Date.now = realNow;
  });

  it('gives every non-default gun its own voice', () => {
    for (const [gun, want] of [
      ['double', 'shot_double'],
      ['laser', 'shot_laser'],
      ['bomb', 'shot_bomb'],
      ['homing', 'shot_homing'],
    ] as const) {
      clock += 10_000;
      playShot(gun);
      expect(voice(want).play).toHaveBeenCalledTimes(1);
    }
  });

  it('leaves the default gun silent', () => {
    // 'single' is the gun you hold for most of a run and fires several times a
    // second; it has no voice at all, which is what makes picking up any other
    // gun audibly change the run. Nothing on the board may sound for it.
    playShot('single');
    for (const n of ['shot_double', 'shot_laser', 'shot_bomb', 'shot_homing']) {
      expect(voice(n).play).not.toHaveBeenCalled();
    }
  });

  it('does not let the silent default consume the throttle window', () => {
    // The bail happens before the throttle is stamped, so a stream of silent
    // default shots cannot swallow the next real shot from a picked-up gun.
    playShot('single');
    playShot('laser');
    expect(voice('shot_laser').play).toHaveBeenCalledTimes(1);
  });

  it('is audible — the placeholder played at 0.1 and could not be heard', () => {
    playShot('laser');
    expect(voice('shot_laser').volume).toBeGreaterThan(0.25);
  });

  it('throttles a sustained stream so a stacked gun cannot rattle', () => {
    playShot('laser');
    playShot('laser');
    playShot('laser');
    expect(voice('shot_laser').play).toHaveBeenCalledTimes(1);
  });
});
