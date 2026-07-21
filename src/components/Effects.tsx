import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GunKind, Particle, FloatText } from '../game/types';
import { PALETTE, GUN_LABEL, COIN_GOLD } from '../game/constants';
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

// --- HUD: altitude, coins, hearts, active gun ---
// Distance is the run's only score, so it takes the headline slot.
interface HUDProps {
  hearts: number;
  coins: number;
  alt: number; // meters climbed
  gun: GunKind;
  gunTime: number; // seconds left on a gift gun
  gunLevel: number;
}

export function HUD({ hearts, coins, alt, gun, gunTime, gunLevel }: HUDProps) {
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
      {/* One heart plus a count, not a row of them: at HEARTS_MAX the repeated
          emoji stretched across the top of the play area. */}
      <Text style={styles.hearts}>❤️ {Math.max(0, hearts)}</Text>
    </View>
  );
}

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
  hearts: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
