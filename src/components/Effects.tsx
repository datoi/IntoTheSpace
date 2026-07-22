import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GunKind, Particle, FloatText } from '../game/types';
import { PALETTE, GUN_LABEL, COIN_GOLD, SCREEN, HEARTS_MAX } from '../game/constants';
import CoinIcon from './Coin';

// --- Particle burst ---
export function ParticleView({ p }: { p: Particle }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: p.x,
        top: p.y,
        width: p.size,
        height: p.size,
        borderRadius: p.size / 2,
        backgroundColor: p.color,
        opacity: Math.min(p.life * 2.5, 1),
      }}
    />
  );
}

// --- Floating score text ("+30", "CLOSE ONE") ---
export function FloatTextView({ f }: { f: FloatText }) {
  return (
    <Text
      pointerEvents="none"
      style={[
        styles.floatText,
        {
          left: f.x - 60,
          top: f.y,
          color: f.color,
          opacity: Math.min(f.life * 2, 1),
        },
      ]}
    >
      {f.text}
    </Text>
  );
}

// --- HUD: altitude, coins, active gun (health lives in the HealthBar) ---
// Distance is the run's only score, so it takes the headline slot.
interface HUDProps {
  coins: number;
  alt: number; // meters climbed
  gun: GunKind;
  gunTime: number; // seconds left on a gift gun
  gunLevel: number;
}

export function HUD({ coins, alt, gun, gunTime, gunLevel }: HUDProps) {
  return (
    <View style={styles.hud} pointerEvents="none">
      <Text style={styles.alt}>🚀 {Math.max(0, Math.round(alt))}m</Text>
      <View style={styles.coinRow}>
        <CoinIcon size={14} />
        <Text style={styles.coins}>{coins}</Text>
      </View>
      {gun !== 'single' && (
        <Text style={styles.gunTxt}>
          {GUN_LABEL[gun]}{gunLevel > 1 ? ` ×${gunLevel}` : ''} · {Math.max(0, Math.ceil(gunTime))}s
        </Text>
      )}
    </View>
  );
}

// --- Health bar: a vertical column on the left. It reads as filled health that
// drains from the top on each hit and tops back up when a ❤️ is collected. The
// fill runs from a hot red at its top to nearly white at the bottom tip. ---
const HP_TOP: [number, number, number] = [255, 46, 67]; // hot red (fill top)
const HP_BOTTOM: [number, number, number] = [255, 233, 237]; // near-white (bottom tip)
const HP_SEGMENTS = 16; // stacked bands fake the gradient (no gradient lib)
const hpBand = (t: number): string => {
  const c = (i: number) => Math.round(HP_TOP[i] + (HP_BOTTOM[i] - HP_TOP[i]) * t);
  return `rgb(${c(0)},${c(1)},${c(2)})`;
};

// Memoized: the parent (GameScreen) re-renders every frame, but health changes
// only on a hit or a ❤️ pickup — so this (and its 16-band gradient fill) should
// reconcile only when `hearts` actually changes, not 60×/sec.
export const HealthBar = React.memo(function HealthBar({ hearts }: { hearts: number }) {
  const frac = Math.max(0, Math.min(1, hearts / HEARTS_MAX));
  return (
    <View style={styles.hpWrap} pointerEvents="none">
      {/* Full/max marker up top (where the fill tops out), heart down below. */}
      <Text style={styles.hpFullIcon}>✚</Text>
      <View style={styles.hpTrack}>
        <View style={[styles.hpFill, { height: `${frac * 100}%` }]}>
          {Array.from({ length: HP_SEGMENTS }, (_, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: hpBand(i / (HP_SEGMENTS - 1)) }} />
          ))}
        </View>
      </View>
      <Text style={styles.hpHeart}>❤️</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  floatText: {
    position: 'absolute',
    width: 120,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '900',
    fontStyle: 'italic',
  },
  hud: {
    position: 'absolute',
    top: 52,
    left: 16,
    right: 66, // leave room for the pause button in the top-right corner
  },
  alt: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    fontStyle: 'italic',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  coinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  coins: {
    color: COIN_GOLD,
    fontSize: 14,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  gunTxt: {
    color: PALETTE.bell,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: -2,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  hpWrap: {
    position: 'absolute',
    left: 16,
    top: SCREEN.H * 0.36,
    alignItems: 'center',
  },
  hpFullIcon: {
    color: '#FF5A6A',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 3,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  hpHeart: {
    fontSize: 14,
    marginTop: 3,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  hpTrack: {
    width: 7,
    height: SCREEN.H * 0.24,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
    justifyContent: 'flex-end', // fill grows up from the bottom
  },
  hpFill: {
    width: '100%',
  },
});
