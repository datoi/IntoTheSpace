import * as Haptics from 'expo-haptics';
import { haptic, hapticFailure, resetHaptics, HapticWeight } from '../haptics';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Error: 'error' },
}));

// A clock we drive by hand, so the budget's timing is tested without real waits.
let now = 0;
const advance = (ms: number) => {
  now += ms;
};

beforeEach(() => {
  jest.clearAllMocks();
  now = 10_000; // start well clear of 0 so the first call isn't a special case
  resetHaptics(() => now);
});

describe('graze storms', () => {
  it('throttles the flood instead of actuating once per bullet', () => {
    // The exact case the budget exists for: a scattergun wall grazing many
    // bullets inside one frame.
    let spent = 0;
    for (let i = 0; i < 40; i++) if (haptic(HapticWeight.Ambient)) spent++;
    expect(spent).toBe(1);
  });

  it('lets ambient texture through again once the gap has passed', () => {
    expect(haptic(HapticWeight.Ambient)).toBe(true);
    advance(139);
    expect(haptic(HapticWeight.Ambient)).toBe(false);
    advance(2);
    expect(haptic(HapticWeight.Ambient)).toBe(true);
  });
});

describe('priority', () => {
  it('always lets damage through, even mid graze storm', () => {
    // The feel bug this fixes: the one haptic the player MUST notice was being
    // buried under continuous graze buzz.
    for (let i = 0; i < 20; i++) haptic(HapticWeight.Ambient);
    hapticFailure();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  });

  it('never rations a heavy haptic', () => {
    for (let i = 0; i < 5; i++) {
      expect(haptic(HapticWeight.Heavy, Haptics.ImpactFeedbackStyle.Heavy)).toBe(true);
    }
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(5);
  });

  it('holds ambient back in the shadow of something important', () => {
    // Silence AROUND a heavy haptic is what makes it read as heavy.
    haptic(HapticWeight.Heavy, Haptics.ImpactFeedbackStyle.Heavy);
    advance(150); // past the ambient gap, still inside the heavy shadow
    expect(haptic(HapticWeight.Ambient)).toBe(false);
    advance(80); // now clear of the shadow
    expect(haptic(HapticWeight.Ambient)).toBe(true);
  });

  it('does not let the shadow suppress meaningful events', () => {
    haptic(HapticWeight.Heavy, Haptics.ImpactFeedbackStyle.Heavy);
    advance(70);
    // A pickup landing right after a bomb still deserves to be felt.
    expect(haptic(HapticWeight.Medium, Haptics.ImpactFeedbackStyle.Medium)).toBe(true);
  });
});

describe('generators', () => {
  it('uses the selection tick for ambient, impact for everything else', () => {
    haptic(HapticWeight.Ambient);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();

    advance(500);
    haptic(HapticWeight.Medium, Haptics.ImpactFeedbackStyle.Medium);
    expect(Haptics.impactAsync).toHaveBeenCalledWith('medium');
  });

  it('lets a one-off soft tick keep the selection feel without ambient rationing', () => {
    // Grabbing the ship: same gentle generator as a graze, but it must not be
    // dropped just because the player was grazing a moment ago.
    haptic(HapticWeight.Ambient);
    advance(10);
    expect(haptic(HapticWeight.Light, 'selection')).toBe(false); // inside Light's own gap
    advance(100);
    expect(haptic(HapticWeight.Light, 'selection')).toBe(true);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2);
  });
});

describe('robustness', () => {
  it('never throws into the game loop when the motor rejects', () => {
    (Haptics.impactAsync as jest.Mock).mockImplementationOnce(() => {
      throw new Error('no vibrator');
    });
    expect(() => haptic(HapticWeight.Heavy, Haptics.ImpactFeedbackStyle.Heavy)).not.toThrow();
  });

  it('swallows a rejected promise rather than surfacing an unhandled rejection', () => {
    (Haptics.impactAsync as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('busy')));
    expect(() => haptic(HapticWeight.Heavy, Haptics.ImpactFeedbackStyle.Heavy)).not.toThrow();
  });
});
