// Settings — currently the audio mixer, and built so it can hold more later.
//
// Its own screen rather than a section of an existing one because volume is
// the setting players look for FIRST and give up on fastest: buried two taps
// deep inside the shop or the stats screen, it may as well not exist. A gear
// in the menu's top bar is where every mobile game has taught them to look.
//
// The controls themselves live in components/AudioMixer so the pause menu can
// mount the same panel mid-run — see AudioMixerPanel.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Chrome } from '../game/theme';
import { FONTS, TYPE } from '../game/type';
import { useThemedStyles } from '../components/Theme';
import { Button } from '../components/Button';
import { AudioMixerPanel, MuteAllButton } from '../components/AudioMixer';

interface Props {
  /**
   * The equipped sky, so the panel can play its music while the screen is
   * open. Without it the music slider is a control with nothing to hear.
   */
  backgroundId: string;
  onBack: () => void;
}

export function SettingsScreen({ backgroundId, onBack }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>AUDIO</Text>
      <Text style={styles.subtitle}>
        Each family is set on its own, so the music can sit under a loud game —
        or the other way round.
      </Text>
      <View style={styles.panel}>
        <AudioMixerPanel previewBg={backgroundId} />
        <MuteAllButton />
      </View>
      <View style={styles.spacer} />
      <Button label="BACK" icon="back" onPress={onBack} style={styles.wideBtn} />
    </View>
  );
}

const makeStyles = (c: Chrome) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      // Transparent: App mounts the ambient parallax behind every shell, and an
      // opaque background here would cover it.
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 56,
      paddingBottom: 28,
    },
    title: {
      color: c.ink,
      fontSize: 28,
      fontFamily: FONTS.display,
      letterSpacing: 4,
    },
    subtitle: {
      ...TYPE.body,
      color: c.inkDim,
      textAlign: 'center',
      marginTop: 10,
      marginBottom: 26,
      maxWidth: 300,
    },
    panel: {
      alignSelf: 'stretch',
      backgroundColor: c.hull,
      borderWidth: 1,
      borderColor: c.edge,
      borderRadius: 14,
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 6,
    },
    spacer: { flex: 1 },
    wideBtn: { alignSelf: 'stretch' },
  });
