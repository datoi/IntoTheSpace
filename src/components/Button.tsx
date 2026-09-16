// The four button variants, so no screen invents its own again.
//
// Before this the app had three competing button weights and a mix of 11px and
// 14px radii, because each screen styled its own. One component means the
// pressed state, the tap target and the radius are decided once.
//
// Minimum tap target is 44×44 everywhere — enforced with `hitSlop` rather than
// padding, so a visually small button (the icon rail) still meets it without
// being drawn oversized.

import React, { useCallback, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { PALETTE } from '../game/constants';
import { UiEvent, playUi } from '../game/sounds';
import { Chrome } from '../game/theme';
import { TYPE } from '../game/type';
import { useChrome, useThemedStyles } from './Theme';
import Icon, { IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

/**
 * What a press sounds like, when the caller hasn't said.
 *
 * Derived from the ICON rather than asked for at every call site, because the
 * icon already encodes the direction: a button wearing 'back' or 'close' is
 * leaving, everything else is going somewhere. That means a screen written
 * next year sounds right without its author having thought about audio, which
 * is the only way a rule like this survives.
 */
const defaultSound = (icon?: IconName): UiEvent =>
  icon === 'back' || icon === 'close' ? 'back' : 'tap';

interface Props {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Optional leading glyph. */
  icon?: IconName;
  /** Unread-count badge, drawn on the corner. */
  badge?: number;
  style?: ViewStyle;
  testID?: string;
  /**
   * Override the press sound. Pass 'confirm' for a button that completes a
   * transaction, 'deny' for one that refuses; `false` silences it entirely,
   * which is only right where the ACTION itself makes the sound (a purchase
   * row that plays confirm or deny depending on the balance, say).
   */
  sound?: UiEvent | false;
}

const RADIUS = 10; // one radius, everywhere
const PRESS_MS = 90;

/**
 * Pressed feedback: scale 0.97 + opacity 0.85 over 90ms.
 *
 * Driven natively so it never competes with the game loop for JS frames, and
 * short enough that it reads as a physical press rather than an animation.
 */
function usePressAnim(disabled: boolean) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.timing(scale, { toValue: v, duration: PRESS_MS, useNativeDriver: true }).start();
  return {
    scale,
    onPressIn: () => !disabled && to(0.97),
    onPressOut: () => !disabled && to(1),
  };
}

/**
 * Wrap a press handler so it also SOUNDS.
 *
 * Exported because plenty of the app's touch targets are raw Pressables — shop
 * rows, tabs, the menu's hull pedestal — and those deserve the same voice
 * without being rebuilt as Buttons.
 *
 * Deliberately fired from onPress (release) rather than onPressIn (touch
 * down), even though touch-down is the more immediate feedback and is what the
 * scale animation uses. Inside a ScrollView, onPressIn fires the instant a
 * finger lands — before the scroll responder has had a chance to claim the
 * gesture — so a press-down click would fire on every attempt to SCROLL the
 * shop. Visual feedback can afford to be wrong for 100ms and then cancel;
 * audio cannot take itself back.
 *
 * Passing `false` silences the press, for call sites where the action itself
 * decides the sound (a purchase that either confirms or denies).
 */
export function useUiPress(onPress: () => void, sound: UiEvent | false = 'tap'): () => void {
  return useCallback(() => {
    if (sound) playUi(sound);
    onPress();
  }, [onPress, sound]);
}

export function Button({
  label,
  onPress,
  variant = 'secondary',
  disabled = false,
  icon,
  badge,
  style,
  testID,
  sound,
}: Props) {
  const { scale, onPressIn, onPressOut } = usePressAnim(disabled);
  const press = useUiPress(onPress, sound ?? defaultSound(icon));
  const styles = useThemedStyles(makeStyles);
  const c = useChrome();
  const tone = disabled
    ? c.inkMute
    : variant === 'primary'
      ? c.accentInk // dark-on-bright, per the §3 allowlist
      : variant === 'ghost'
        ? c.inkDim
        : c.ink;

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        testID={testID}
        onPress={disabled ? undefined : press}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        // Meets the 44×44 minimum without drawing the button that large.
        hitSlop={10}
        style={({ pressed }) => [
          styles.base,
          variant === 'primary' && styles.primary,
          variant === 'secondary' && styles.secondary,
          variant === 'ghost' && styles.ghost,
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
        ]}
      >
        {icon && <Icon name={icon} size={15} color={tone} />}
        <Text style={[styles.label, { color: tone }]}>{label}</Text>
        {badge !== undefined && badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

/**
 * A square icon button for the menu rail.
 *
 * Same press feel and the same 44×44 guarantee; the label sits underneath at
 * `micro` rather than inline.
 */
export function IconButton({
  icon,
  label,
  onPress,
  badge,
  testID,
  sound,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  badge?: number;
  testID?: string;
  sound?: UiEvent | false;
}) {
  const { scale, onPressIn, onPressOut } = usePressAnim(false);
  const press = useUiPress(onPress, sound ?? defaultSound(icon));
  const styles = useThemedStyles(makeStyles);
  const c = useChrome();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        testID={testID}
        onPress={press}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        hitSlop={10}
        style={({ pressed }) => [styles.railBtn, pressed && styles.pressed]}
      >
        <Icon name={icon} size={22} color={c.ink} />
        <Text style={styles.railLabel}>{label}</Text>
        {badge !== undefined && badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// Only the ground tokens take the sky's hue. `plasma` (the primary CTA) and
// `threat` (the badge) stay put: they are the player's colour and the hostile
// colour, and they mean the same thing under every sky.
const makeStyles = (c: Chrome) =>
  StyleSheet.create({
    base: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 22,
      borderRadius: RADIUS,
    },
    // The one bold CTA. plasmaDeep would be the gradient's far stop; RN has no
    // gradient without a dependency, so this uses the accent flat and earns its
    // emphasis from being the only thing wearing it.
    //
    // `accent`, not `plasma`: LIFT OFF is shell furniture and follows the sky.
    // The player's own colour does not move - see the note on Chrome.accent.
    primary: {
      backgroundColor: c.accent,
    },
    secondary: {
      backgroundColor: c.hull,
      borderWidth: 1,
      borderColor: c.edge,
    },
    ghost: {
      backgroundColor: 'transparent',
    },
    disabled: {
      backgroundColor: c.hull,
      borderWidth: 1,
      borderColor: c.edge,
      opacity: 0.5,
    },
    pressed: { opacity: 0.85 },
    label: {
      ...TYPE.label,
    },
    railBtn: {
      width: 62,
      minHeight: 56,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderRadius: RADIUS,
      paddingVertical: 8,
      backgroundColor: c.hull,
      borderWidth: 1,
      borderColor: c.edge,
    },
    railLabel: {
      ...TYPE.micro,
      color: c.inkDim,
    },
    badge: {
      position: 'absolute',
      top: -6,
      right: -6,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 5,
      backgroundColor: PALETTE.threat,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeTxt: {
      ...TYPE.micro,
      color: c.ink,
      letterSpacing: 0,
    },
  });
