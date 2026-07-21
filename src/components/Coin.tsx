import React from 'react';
import { View } from 'react-native';
import { COIN_GOLD, COIN_GOLD_EDGE, COIN_GOLD_SHINE } from '../game/constants';

// A drawn gold coin rather than the 🪙 emoji, which platforms render silver or
// bronze. Shared by the HUD, the shop and the falling pickup so the thing you
// grab in flight is visibly the same currency you spend.
export default function CoinIcon({ size }: { size: number }) {
  return (
    <View
      pointerEvents="none"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: COIN_GOLD,
        borderWidth: Math.max(1, size * 0.09),
        borderColor: COIN_GOLD_EDGE,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: size * 0.4,
          height: size * 0.4,
          borderRadius: size * 0.2,
          backgroundColor: COIN_GOLD_SHINE,
          opacity: 0.75,
        }}
      />
    </View>
  );
}
