import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Card } from '../game/types';
import {
  laneX,
  OB_EMOJI,
  OB_VIS,
  ENEMY_SHIP_VIS,
  ENEMY_SHIPS,
  GUN_PICKUP_IMG,
  GIFT_ICON,
  BOSS_MINI_IMG,
  BOSS_GIANT_IMG,
  BOSS_MINI_VIS,
  BOSS_GIANT_VIS,
  COIN_GOLD,
  COIN_VIS,
  PALETTE,
} from '../game/constants';
import CoinIcon from './Coin';

const GLOW: Record<string, string> = {
  rage: PALETTE.rage,
  heart: PALETTE.moment,
  gift: PALETTE.bell,
  coin: COIN_GOLD,
};

// Instantly readable obstacles — no text to parse at game speed.
// Enemy ship = shoot it, ❤️ = catch, 🎁 = gun.
function ObstacleView({ ob }: { ob: Card }) {
  // Resolved obstacles pop (scale + fade); bullet hits flash with a scale bump.
  const t = Math.min(ob.deadT / 0.18, 1);
  const scale = ob.dead ? 1 + t * 0.45 : 1 + ob.hitT * 0.9;
  const opacity = ob.dead ? 1 - t : 1;
  // Visual is centered on the (smaller) hitbox — follows a charging enemy.
  const cx = ob.cx ?? laneX(ob.lane);
  const cy = ob.y + ob.h / 2;
  // A gun drop wears the art of the gun it grants; the laser has no projectile
  // sprite, so it keeps the emoji path below.
  const gunImg = ob.kind === 'gift' && ob.gun ? GUN_PICKUP_IMG[ob.gun] : undefined;
  const showHp = ob.maxHp > 1 && !ob.dead;
  const hpBar = showHp && (
    <View style={styles.hpTrack}>
      <View style={[styles.hpFill, { width: `${(Math.max(0, ob.hp) / ob.maxHp) * 100}%` }]} />
    </View>
  );

  if (ob.kind === 'rage' && ob.boss) {
    // Boss: one big monster, rendered well above the (forgiving) hitbox.
    const vis = ob.boss === 'giant' ? BOSS_GIANT_VIS : BOSS_MINI_VIS;
    return (
      <View
        style={{
          position: 'absolute',
          left: cx - vis / 2,
          top: cy - vis / 2,
          width: vis,
          height: vis,
          opacity,
          transform: [{ scale }],
        }}
        pointerEvents="none"
      >
        {hpBar}
        <Image
          source={ob.boss === 'giant' ? BOSS_GIANT_IMG : BOSS_MINI_IMG}
          style={{ width: vis, height: vis }}
          resizeMode="contain"
          fadeDuration={0}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.emojiWrap,
        {
          left: cx - OB_VIS / 2,
          top: cy - OB_VIS / 2,
          opacity,
          transform: [{ scale }],
        },
      ]}
      pointerEvents="none"
    >
      {hpBar}
      {ob.kind !== 'rage' && (
        <>
          <View style={[styles.glow, { backgroundColor: GLOW[ob.kind] }]} />
          <View style={[styles.glowRing, { borderColor: GLOW[ob.kind] }]} />
        </>
      )}
      {ob.kind === 'rage' ? (
        <Image
          source={ENEMY_SHIPS[Math.min(ob.shipIdx ?? 0, ENEMY_SHIPS.length - 1)]}
          style={styles.enemyShip}
          resizeMode="contain"
          fadeDuration={0}
        />
      ) : ob.kind === 'coin' ? (
        <CoinIcon size={COIN_VIS} />
      ) : gunImg ? (
        <Image source={gunImg} style={styles.giftIcon} resizeMode="contain" fadeDuration={0} />
      ) : (
        <Text style={styles.emoji}>{ob.emoji}</Text>
      )}
    </View>
  );
}

// No memo: the game loop mutates obstacle objects in place, so a prop-equality
// check always sees the same object and would freeze them at their spawn
// position. The parent re-renders every frame anyway.
export default ObstacleView;

const styles = StyleSheet.create({
  // --- HP bar for multi-hit enemies ---
  hpTrack: {
    position: 'absolute',
    top: -9,
    left: '12%',
    right: '12%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.4)',
    overflow: 'hidden',
    zIndex: 1,
  },
  hpFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: PALETTE.rage,
  },
  // --- Emoji obstacles (rage / moment / gift) ---
  emojiWrap: {
    position: 'absolute',
    width: OB_VIS,
    height: OB_VIS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: OB_VIS,
    height: OB_VIS,
    borderRadius: OB_VIS / 2,
    opacity: 0.28,
  },
  glowRing: {
    position: 'absolute',
    width: OB_VIS - 6,
    height: OB_VIS - 6,
    borderRadius: (OB_VIS - 6) / 2,
    borderWidth: 2,
    opacity: 0.55,
  },
  emoji: {
    fontSize: OB_EMOJI,
  },
  enemyShip: {
    width: ENEMY_SHIP_VIS,
    height: ENEMY_SHIP_VIS,
  },
  giftIcon: {
    width: GIFT_ICON,
    height: GIFT_ICON,
  },
});
