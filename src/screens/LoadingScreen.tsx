import React, { useCallback, useEffect, useRef } from 'react';
import { FONTS } from '../game/type';
import { View, Text, Image, StyleSheet } from 'react-native';
import { PRELOAD_SPRITES } from '../game/preload';
import { PALETTE } from '../game/constants';

interface Props {
  progress: number; // 0..1
  onSpritesDecoded: () => void; // every sprite has painted at least once
}

// Shown while boot fetches assets. It also mounts every gameplay sprite at its
// true in-game size (off-screen): the fetch puts files on disk, this forces the
// decode, so both costs are paid here instead of on the first frame of a run.
// Reports back once each sprite has actually painted, so boot can wait for the
// decode rather than just the download.
export default function LoadingScreen({ progress, onSpritesDecoded }: Props) {
  const pct = Math.round(Math.max(0, Math.min(progress, 1)) * 100);
  const settled = useRef(0);
  const firedRef = useRef(false);
  const doneRef = useRef(onSpritesDecoded);
  doneRef.current = onSpritesDecoded;

  const fire = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    doneRef.current();
  }, []);

  // Nothing to decode (an empty sprite list) must not stall the gate.
  useEffect(() => {
    if (PRELOAD_SPRITES.length === 0) fire();
  }, [fire]);

  // A sprite that fails to decode still counts: one missing image is not a
  // reason to hold the player on a loading screen.
  const settle = useCallback(() => {
    settled.current += 1;
    if (settled.current >= PRELOAD_SPRITES.length) fire();
  }, [fire]);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>INTO THE SPACE</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.pct}>PREPARING LAUNCH · {pct}%</Text>

      <View pointerEvents="none" style={styles.warm}>
        {PRELOAD_SPRITES.map((s, i) => (
          <Image
            key={i}
            source={s.src}
            fadeDuration={0}
            onLoad={settle}
            onError={settle}
            style={{ width: s.w, height: s.h }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PALETTE.void,
    paddingHorizontal: 32,
  },
  title: {
    color: PALETTE.ink,
    fontSize: 26,
    fontFamily: FONTS.display,
    letterSpacing: 3,
    marginBottom: 26,
  },
  track: {
    width: '100%',
    maxWidth: 280,
    height: 6,
    borderRadius: 3,
    backgroundColor: PALETTE.edge,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: PALETTE.plasma,
  },
  pct: {
    color: PALETTE.inkDim,
    fontSize: 12.5,
    fontFamily: FONTS.display,
    letterSpacing: 1.2,
    marginTop: 14,
  },
  warm: {
    position: 'absolute',
    left: -400, // parked off-screen; images still decode and warm the cache
    top: 0,
  },
});
