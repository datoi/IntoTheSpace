import { createAudioPlayer } from 'expo-audio';
import { startMusic, stopMusic } from '../music';
import { resetMixer, setChannelVolume } from '../mixer';

const mockCreate = createAudioPlayer as jest.Mock;

/**
 * The music channel.
 *
 * Kept out of music.test.ts, which guards the soundtrack TABLE from the
 * filesystem and does not touch players at all. This is about levels.
 *
 * The live re-level is the interesting one: without it a slider would only
 * take effect at the next track handoff — up to half a minute away — and a
 * control that appears to do nothing reads as broken, not as delayed.
 */

// The authored level in music.ts. Duplicated deliberately: if that constant is
// retuned, this fails and someone re-reads the balance rather than the number
// silently following it.
const MUSIC_BASE = 0.35;

const playersFor = (bg: string) => {
  mockCreate.mockClear();
  startMusic(bg);
  return mockCreate.mock.results.map((r) => r.value);
};

afterEach(() => {
  stopMusic();
  resetMixer();
});

describe('music volume', () => {
  it('plays at the authored level with the channel at unity', () => {
    const [first] = playersFor('violet');
    expect(first.volume).toBeCloseTo(MUSIC_BASE);
  });

  it('scales the authored level rather than replacing it', () => {
    // Half volume means half of the tuned level, not 0.5 — the balance between
    // music and effects is set in music.ts and the player only scales it.
    setChannelVolume('music', 0.5);
    const [first] = playersFor('violet');
    expect(first.volume).toBeCloseTo(MUSIC_BASE * 0.5);
  });

  it('re-levels the track that is already playing', () => {
    const [first] = playersFor('violet');
    setChannelVolume('music', 0.2);
    expect(first.volume).toBeCloseTo(MUSIC_BASE * 0.2);
  });

  it('goes fully silent at zero', () => {
    const [first] = playersFor('violet');
    setChannelVolume('music', 0);
    expect(first.volume).toBe(0);
  });

  it('leaves the sfx channel out of it', () => {
    setChannelVolume('sfx', 0);
    const [first] = playersFor('violet');
    expect(first.volume).toBeCloseTo(MUSIC_BASE);
  });

  it('survives a change with nothing mounted', () => {
    stopMusic();
    expect(() => setChannelVolume('music', 0.4)).not.toThrow();
  });
});
