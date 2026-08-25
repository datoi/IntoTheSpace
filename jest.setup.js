/* Global mocks for native modules that have no JS implementation under Jest. */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-audio', () => {
  const makePlayer = () => ({
    volume: 1,
    playing: false,
    playbackRate: 1,
    shouldCorrectPitch: true,
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    remove: jest.fn(),
    // AudioPlayer extends SharedObject, which extends EventEmitter. music.ts
    // drives its track handoff off 'playbackStatusUpdate', so a player without
    // addListener is not a faithful double — the tests passed while the real
    // module would have thrown.
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeListener: jest.fn(),
  });
  return {
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
    createAudioPlayer: jest.fn(makePlayer),
  };
});

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: () => ({ downloadAsync: jest.fn(() => Promise.resolve()) }),
    loadAsync: jest.fn(() => Promise.resolve([])),
  },
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
