import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { Button } from '../Button';
import { AudioMixerPanel, MuteAllButton } from '../AudioMixer';
import { audioSettings, resetMixer, setChannelVolume } from '../../game/mixer';
import { playUi } from '../../game/sounds';

jest.mock('../../game/sounds', () => ({
  ...jest.requireActual('../../game/sounds'),
  playUi: jest.fn(),
  playPop: jest.fn(),
}));


const mockPlayUi = playUi as jest.Mock;

beforeEach(() => {
  resetMixer();
  mockPlayUi.mockClear();
});
afterAll(resetMixer);

describe('press feedback', () => {
  /**
   * The press sound is wired into the shared Button rather than into call
   * sites, so a screen written later sounds right without its author having
   * thought about audio. That only holds while these two hold.
   */
  it('speaks for a button that has no opinion', async () => {
    await render(<Button label="LIFT OFF" onPress={jest.fn()} />);
    fireEvent.press(screen.getByText('LIFT OFF'));
    expect(mockPlayUi).toHaveBeenCalledWith('tap');
  });

  it('derives the BACK voice from the icon, with nothing asked of the caller', async () => {
    await render(<Button label="BACK" icon="back" onPress={jest.fn()} />);
    fireEvent.press(screen.getByText('BACK'));
    expect(mockPlayUi).toHaveBeenCalledWith('back');
  });

  it('lets a call site override the voice', async () => {
    await render(<Button label="BUY" onPress={jest.fn()} sound="confirm" />);
    fireEvent.press(screen.getByText('BUY'));
    expect(mockPlayUi).toHaveBeenCalledWith('confirm');
  });

  it('can be silenced where the action owns the sound', async () => {
    await render(<Button label="QUIET" onPress={jest.fn()} sound={false} />);
    fireEvent.press(screen.getByText('QUIET'));
    expect(mockPlayUi).not.toHaveBeenCalled();
  });

  it('still runs the handler', async () => {
    const onPress = jest.fn();
    await render(<Button label="GO" onPress={onPress} />);
    fireEvent.press(screen.getByText('GO'));
    expect(onPress).toHaveBeenCalled();
  });

  it('does not fire for a disabled button', async () => {
    const onPress = jest.fn();
    await render(<Button label="MAXED" onPress={onPress} disabled />);
    fireEvent.press(screen.getByText('MAXED'));
    expect(mockPlayUi).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('AudioMixerPanel', () => {
  it('shows one control per channel, reading the live mixer', async () => {
    setChannelVolume('sfx', 0.5);
    await render(<AudioMixerPanel />);
    expect(screen.getByTestId('volume-sfx').props.accessibilityValue.now).toBe(50);
    expect(screen.getByTestId('volume-ui').props.accessibilityValue.now).toBe(100);
    // The soundtrack is gone, and a slider that scales a family with no
    // members would be a control the player can prove does nothing.
    expect(screen.queryByTestId('volume-music')).toBeNull();
  });

  it('follows a change made somewhere else', async () => {
    // The mixer is the source of truth, not the panel — which is what lets the
    // pause menu and the settings screen show the same values without a shared
    // parent holding them.
    await render(<AudioMixerPanel />);
    // Wrapped in act because this is the point: the change originates OUTSIDE
    // React, from the same imperative mixer the game loop writes to.
    await act(async () => setChannelVolume('sfx', 0.25));
    expect(await screen.findByText('25%')).toBeTruthy();
  });

  it('says OFF rather than 0%', async () => {
    setChannelVolume('ui', 0);
    await render(<AudioMixerPanel />);
    expect(screen.getByText('OFF')).toBeTruthy();
  });
});

describe('MuteAllButton', () => {
  it('silences every channel at once', async () => {
    await render(<MuteAllButton />);
    fireEvent.press(screen.getByTestId('mute-all'));
    expect(audioSettings()).toEqual({ ui: 0, sfx: 0 });
  });

  it('restores to the shipped mix, and proves it audibly', async () => {
    setChannelVolume('ui', 0);
    setChannelVolume('sfx', 0);
    await render(<MuteAllButton />);
    fireEvent.press(screen.getByTestId('mute-all'));
    expect(audioSettings()).toEqual({ ui: 1, sfx: 1 });
    // A restore with no sound leaves the player unsure it worked.
    expect(mockPlayUi).toHaveBeenCalledWith('tap');
  });

  it('offers the way back once everything is off', async () => {
    await render(<MuteAllButton />);
    fireEvent.press(screen.getByTestId('mute-all'));
    expect(await screen.findByText(/TAP TO RESTORE/)).toBeTruthy();
  });
});
