// Typography tokens.
//
// Two faces, both OFL, both loaded from @expo-google-fonts so there are no font
// files to manage by hand:
//
//   Chakra Petch  — DISPLAY. Wordmark, titles, buttons, ribbons, labels.
//   JetBrains Mono — DATA. Score, multiplier, timers, prices, every stat.
//
// Why this matters more than it looks: every `fontStyle: 'italic'` in the old
// code was a SYNTHETIC slant, which Android produces by shearing the glyphs.
// Chakra Petch ships a real italic file, so italics now come from the FACE and
// `fontStyle` is never used on the display family again.
//
// Tabular figures are mandatory on the score. It's the headline number, it
// counts up constantly, and in a proportional font the digit widths differ so
// the whole number jitters sideways as it climbs.

import { TextStyle } from 'react-native';

/** Font family names, as registered with expo-font in App.tsx. */
export const FONTS = {
  displaySemi: 'ChakraPetch_600SemiBold',
  display: 'ChakraPetch_700Bold',
  displayItalic: 'ChakraPetch_700Bold_Italic',
  data: 'JetBrainsMono_700Bold',
  dataBold: 'JetBrainsMono_800ExtraBold',
} as const;

// Body copy uses the SYSTEM face (the spec allows "Inter or system"). Shipping a
// third family for descriptions would add a package and two more files to the
// boot gate to serve text the platform already renders well, and the system UI
// font is what users read everything else in.

/**
 * Tracking is specified in em in the spec; React Native's `letterSpacing` is in
 * px, so it has to be resolved against each size.
 */
const track = (size: number, em: number): number => Math.round(size * em * 100) / 100;

/**
 * The type scale. Every text style in the app should come from here rather than
 * inventing a size — the old code had a dozen ad-hoc sizes between 8.5 and 80,
 * several of them below the legibility floor.
 *
 * Floors, per the spec: never below 12.5px for reading text, never below 10.5px
 * for labels.
 */
export const TYPE = {
  /** Game-over score. The single biggest thing in the app. */
  displayXl: {
    fontFamily: FONTS.display,
    fontSize: 72,
    lineHeight: 72 * 0.94,
    letterSpacing: track(72, -0.025),
  },
  /** Screen titles and the wordmark. */
  displayL: {
    fontFamily: FONTS.display,
    fontSize: 44,
    lineHeight: 44,
    letterSpacing: track(44, -0.02),
  },
  /** The wordmark's accent line — the one place a real italic earns its keep. */
  displayLItalic: {
    fontFamily: FONTS.displayItalic,
    fontSize: 44,
    lineHeight: 44,
    letterSpacing: track(44, -0.02),
  },
  /** HUD score. Monospaced and tabular so it can't jitter as it counts. */
  score: {
    fontFamily: FONTS.dataBold,
    fontSize: 34,
    lineHeight: 34,
    letterSpacing: track(34, -0.03),
    fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
  },
  /** Card names and section heads. */
  title: {
    fontFamily: FONTS.display,
    fontSize: 20,
    lineHeight: 24,
  },
  /** Descriptions and guide rows — system face, so no fontFamily. */
  body: {
    fontSize: 14,
    lineHeight: 14 * 1.45,
    fontWeight: '500' as TextStyle['fontWeight'],
  },
  /** Buttons, eyebrows, tabs. */
  label: {
    fontFamily: FONTS.display,
    fontSize: 12,
    lineHeight: 14.4,
    letterSpacing: track(12, 0.16),
  },
  /** Chips, ribbons, pips — the smallest text allowed anywhere. */
  micro: {
    fontFamily: FONTS.display,
    fontSize: 10.5,
    lineHeight: 12.6,
    letterSpacing: track(10.5, 0.14),
  },
  /** Any number that should stay still while it changes. */
  data: {
    fontFamily: FONTS.data,
    fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
  },
} as const;

/** Every face the boot gate must load before the UI is allowed to paint. */
export const FONT_MAP = {
  [FONTS.displaySemi]: require('@expo-google-fonts/chakra-petch/600SemiBold/ChakraPetch_600SemiBold.ttf'),
  [FONTS.display]: require('@expo-google-fonts/chakra-petch/700Bold/ChakraPetch_700Bold.ttf'),
  [FONTS.displayItalic]: require('@expo-google-fonts/chakra-petch/700Bold_Italic/ChakraPetch_700Bold_Italic.ttf'),
  [FONTS.data]: require('@expo-google-fonts/jetbrains-mono/700Bold/JetBrainsMono_700Bold.ttf'),
  [FONTS.dataBold]: require('@expo-google-fonts/jetbrains-mono/800ExtraBold/JetBrainsMono_800ExtraBold.ttf'),
};
