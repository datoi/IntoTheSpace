import {
  CHANNELS,
  DEFAULT_AUDIO,
  audioSettings,
  channelVolume,
  normalizeAudio,
  onAudioChange,
  resetMixer,
  setAudioSettings,
  setChannelVolume,
} from '../mixer';

afterEach(resetMixer);

describe('defaults', () => {
  it('ships every channel at unity', () => {
    // Load-bearing, not cosmetic: the per-event level tables (SYSTEM_VOICE,
    // MUSIC_BASE, the shot volumes) are the tuned mix, and a default below 1
    // would mean the game had two competing opinions about how loud it is.
    for (const ch of CHANNELS) expect(DEFAULT_AUDIO[ch]).toBe(1);
  });

  it('hands back a copy, so a caller cannot mutate the live gains', () => {
    const snapshot = audioSettings();
    snapshot.music = 0;
    expect(channelVolume('music')).toBe(1);
  });
});

describe('setChannelVolume', () => {
  it('clamps to 0..1', () => {
    setChannelVolume('sfx', 4);
    expect(channelVolume('sfx')).toBe(1);
    setChannelVolume('sfx', -2);
    expect(channelVolume('sfx')).toBe(0);
  });

  it('leaves the other channels alone', () => {
    setChannelVolume('ui', 0);
    expect(channelVolume('sfx')).toBe(1);
    expect(channelVolume('music')).toBe(1);
  });

  it('notifies subscribers with the new settings', () => {
    const seen = jest.fn();
    onAudioChange(seen);
    setChannelVolume('music', 0.5);
    expect(seen).toHaveBeenCalledWith({ ui: 1, sfx: 1, music: 0.5 });
  });

  it('stays silent when the value has not moved', () => {
    // This is what keeps a drag gesture from writing to disk on every touch
    // event that lands inside the step it is already on — see the debounced
    // persistence effect in App.tsx.
    const seen = jest.fn();
    onAudioChange(seen);
    setChannelVolume('music', 0.5);
    setChannelVolume('music', 0.5);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('survives a subscriber that throws', () => {
    const good = jest.fn();
    onAudioChange(() => {
      throw new Error('listener exploded');
    });
    onAudioChange(good);
    expect(() => setChannelVolume('ui', 0.25)).not.toThrow();
    expect(good).toHaveBeenCalled();
  });

  it('stops notifying after unsubscribe', () => {
    const seen = jest.fn();
    const off = onAudioChange(seen);
    off();
    setChannelVolume('ui', 0.1);
    expect(seen).not.toHaveBeenCalled();
  });
});

describe('setAudioSettings', () => {
  it('applies every provided channel in one notification', () => {
    const seen = jest.fn();
    onAudioChange(seen);
    setAudioSettings({ ui: 0.2, sfx: 0.4, music: 0.6 });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(audioSettings()).toEqual({ ui: 0.2, sfx: 0.4, music: 0.6 });
  });

  it('ignores channels it was not given', () => {
    setChannelVolume('ui', 0.5);
    setAudioSettings({ music: 0 });
    expect(channelVolume('ui')).toBe(0.5);
  });

  it('does not notify when nothing changed', () => {
    const seen = jest.fn();
    onAudioChange(seen);
    setAudioSettings({ ...DEFAULT_AUDIO });
    expect(seen).not.toHaveBeenCalled();
  });
});

describe('normalizeAudio', () => {
  it('reads a save with no audio key as the shipped mix', () => {
    // The field is additive, so every existing player's save arrives without
    // it. They must hear exactly what they heard before they updated — silence
    // would be the worst possible reading of "never configured".
    expect(normalizeAudio(undefined)).toEqual(DEFAULT_AUDIO);
    expect(normalizeAudio({})).toEqual(DEFAULT_AUDIO);
  });

  it('falls back to unity per channel rather than to zero', () => {
    expect(normalizeAudio({ ui: NaN, sfx: 'loud', music: 0.5 })).toEqual({
      ui: 1,
      sfx: 1,
      music: 0.5,
    });
  });

  it('clamps stored values into range', () => {
    expect(normalizeAudio({ ui: 9, sfx: -3, music: 0 })).toEqual({ ui: 1, sfx: 0, music: 0 });
  });

  it('keeps a legitimate zero', () => {
    // Muted is a real choice and must survive a relaunch — the one case where
    // "falsy" and "missing" must not be treated alike.
    expect(normalizeAudio({ ui: 0, sfx: 0, music: 0 })).toEqual({ ui: 0, sfx: 0, music: 0 });
  });

  it('ignores keys that are not channels', () => {
    expect(normalizeAudio({ master: 0.1 })).toEqual(DEFAULT_AUDIO);
  });
});
