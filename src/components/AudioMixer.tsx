// The volume controls — one row per mixer channel, shared by the settings
// screen and the pause menu.
//
// ONE component for both, because they are the same control in two places and
// the pause menu is where a player actually notices the game is too loud.
// Two copies would be guaranteed to drift.
//
// The slider is hand-rolled on PanResponder rather than pulled from
// @react-native-community/slider on purpose: that package is a NATIVE module,
// so adding it costs every contributor a new dev-client build and every
// release an EAS rebuild — for one screen with two rows. This is ~60 lines,
// and it also lets the track wear the app's chrome instead of the platform's.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AudioSettings,
  Channel,
  audioSettings,
  channelVolume,
  onAudioChange,
  setChannelVolume,
} from '../game/mixer';
import { playPop, playUi } from '../game/sounds';
import { HapticWeight, haptic } from '../game/haptics';
import { Chrome } from '../game/theme';
import { TYPE } from '../game/type';
import { useChrome, useThemedStyles } from './Theme';
import Icon, { IconName } from './Icon';

/**
 * The live mixer, as React state.
 *
 * The mixer is the runtime source of truth — the game loop reads it from
 * non-React code — so this SUBSCRIBES rather than owning the value. That is
 * what lets two panels, or a panel and the save layer, stay in step without a
 * shared parent to hold the state for them.
 */
function useAudioSettings(): AudioSettings {
  const [settings, setSettings] = useState<AudioSettings>(audioSettings);
  useEffect(() => {
    // Re-read on mount as well as subscribing: the boot handoff in App.tsx can
    // land between this component's first render and this effect.
    setSettings(audioSettings());
    return onAudioChange(setSettings);
  }, []);
  return settings;
}

/**
 * Volume is set in twentieths.
 *
 * Continuous would be worse in every way that matters here: the ear cannot
 * resolve a 1% step, a readout of 63% is noise where 65% is a decision, and a
 * stepped control is what lets the haptic tick mean something.
 */
const STEPS = 20;
const snap = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * STEPS) / STEPS;

const TRACK_H = 6;
const KNOB = 22;

interface RowProps {
  channel: Channel;
  label: string;
  icon: IconName;
  value: number;
  /** Fired when the finger lifts, so the player hears what they just set. */
  onAudition: (channel: Channel) => void;
}

function ChannelRow({ channel, label, icon, value, onAudition }: RowProps) {
  const styles = useThemedStyles(makeStyles);
  const c = useChrome();
  const width = useRef(0);
  // The value the gesture started from. Drags accumulate `dx` off this rather
  // than re-reading a screen position, so the slider never needs to know where
  // it sits on the page — only how wide it is.
  const startValue = useRef(value);

  const apply = useCallback(
    (next: number) => {
      const snapped = snap(next);
      if (snapped === channelVolume(channel)) return;
      setChannelVolume(channel, snapped);
      // One tick per STEP crossed, not per touch event. The haptic budget
      // rations Ambient to ~7/s, which is what stops a fast drag turning the
      // motor into a continuous buzz.
      haptic(HapticWeight.Ambient, 'selection');
    },
    [channel]
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Claims the touch immediately, so a press anywhere on the track jumps
        // to that value. A slider you can only move by grabbing the knob feels
        // broken on a phone.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Never let a parent ScrollView steal the gesture mid-drag.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const w = width.current;
          if (!w) return;
          const at = snap(e.nativeEvent.locationX / w);
          startValue.current = at;
          apply(at);
        },
        onPanResponderMove: (_e, g) => {
          const w = width.current;
          if (!w) return;
          apply(startValue.current + g.dx / w);
        },
        onPanResponderRelease: () => onAudition(channel),
      }),
    [apply, channel, onAudition]
  );

  const pct = Math.round(value * 100);
  const muted = value <= 0;

  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Icon name={icon} size={16} color={muted ? c.inkMute : c.ink} />
        <Text style={[styles.rowLabel, muted && styles.rowLabelMuted]}>{label}</Text>
        <Text style={[styles.rowValue, muted && styles.rowLabelMuted]}>
          {muted ? 'OFF' : `${pct}%`}
        </Text>
      </View>
      <View
        testID={`volume-${channel}`}
        accessibilityRole="adjustable"
        accessibilityLabel={`${label} volume`}
        accessibilityValue={{ min: 0, max: 100, now: pct }}
        style={styles.trackHit}
        onLayout={(e) => {
          width.current = e.nativeEvent.layout.width;
        }}
        {...pan.panHandlers}
      >
        <View style={styles.track}>
          <View
            style={[styles.fill, { width: `${pct}%`, backgroundColor: muted ? c.edge : c.accent }]}
          />
        </View>
        <View style={[styles.knob, { left: `${pct}%`, borderColor: muted ? c.edge : c.accent }]} />
      </View>
    </View>
  );
}

const ROWS: { channel: Channel; label: string; icon: IconName }[] = [
  { channel: 'sfx', label: 'EFFECTS', icon: 'sound' },
  { channel: 'ui', label: 'INTERFACE', icon: 'ui' },
];

interface PanelProps {
  /** Tighter spacing, for the pause overlay where vertical room is scarce. */
  compact?: boolean;
}

export function AudioMixerPanel({ compact = false }: PanelProps) {
  const styles = useThemedStyles(makeStyles);
  const settings = useAudioSettings();

  /**
   * What each channel sounds like, played when the finger lifts.
   *
   * Both channels are silent until something fires, so each auditions a
   * representative voice — the kill pop is the loudest thing the sfx channel
   * routinely carries, and the tap IS the ui channel. Without an audition the
   * panel would be a pair of blind controls: drag, hear nothing, and leave the
   * screen none the wiser about what you just set.
   */
  const audition = useCallback((channel: Channel) => {
    if (channel === 'sfx') playPop(3);
    else if (channel === 'ui') playUi('tap');
  }, []);

  return (
    <View style={[styles.panel, compact && styles.panelCompact]}>
      {ROWS.map((r) => (
        <ChannelRow key={r.channel} {...r} value={settings[r.channel]} onAudition={audition} />
      ))}
    </View>
  );
}

/**
 * Mute or restore every channel at once.
 *
 * Worth its own control because "silence the game right now" is a different
 * intent from "balance the mix", and a player reaching for it (someone walked
 * in, the train got quiet) should not have to drag every slider to zero.
 */
export function MuteAllButton() {
  const styles = useThemedStyles(makeStyles);
  const c = useChrome();
  const s = useAudioSettings();
  const silent = s.sfx <= 0 && s.ui <= 0;
  // Restoring goes to unity rather than to "whatever it was before": keeping a
  // pre-mute snapshot would need somewhere to live across screens and app
  // launches, and unity is the shipped mix — the one level every player can
  // predict without being told.
  const toggle = () => {
    const to = silent ? 1 : 0;
    for (const row of ROWS) setChannelVolume(row.channel, to);
    haptic(HapticWeight.Medium);
    if (silent) playUi('tap'); // audible proof the sound came back
  };
  return (
    <Pressable
      testID="mute-all"
      onPress={toggle}
      hitSlop={10}
      accessibilityRole="button"
      style={({ pressed }) => [styles.mute, pressed && styles.mutePressed]}
    >
      <Icon name="sound" size={13} color={silent ? c.accent : c.inkDim} />
      <Text style={[styles.muteTxt, silent && { color: c.accent }]}>
        {silent ? 'SOUND OFF — TAP TO RESTORE' : 'MUTE EVERYTHING'}
      </Text>
    </Pressable>
  );
}

const makeStyles = (c: Chrome) =>
  StyleSheet.create({
    panel: {
      alignSelf: 'stretch',
      gap: 18,
    },
    panelCompact: {
      gap: 10,
    },
    row: {
      alignSelf: 'stretch',
    },
    rowHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    rowLabel: {
      ...TYPE.label,
      color: c.ink,
      flex: 1,
    },
    rowLabelMuted: {
      color: c.inkMute,
    },
    rowValue: {
      ...TYPE.micro,
      ...TYPE.data,
      color: c.inkDim,
    },
    // 44px of touch band around a 6px track. Invisible and load-bearing: a
    // slider you have to hit precisely is one you fight.
    trackHit: {
      height: 44,
      justifyContent: 'center',
    },
    track: {
      height: TRACK_H,
      borderRadius: TRACK_H / 2,
      backgroundColor: c.hull,
      borderWidth: 1,
      borderColor: c.edge,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
    },
    knob: {
      position: 'absolute',
      width: KNOB,
      height: KNOB,
      borderRadius: KNOB / 2,
      borderWidth: 2,
      backgroundColor: c.void,
      // `left` is the value's percentage point; this pulls the knob back by
      // half its own width so it sits centred on that point rather than to the
      // right of it.
      marginLeft: -KNOB / 2,
    },
    mute: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 10,
    },
    mutePressed: {
      opacity: 0.7,
    },
    muteTxt: {
      ...TYPE.micro,
      color: c.inkDim,
    },
  });
