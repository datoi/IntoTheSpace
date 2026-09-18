import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Card } from '../game/types';
import { eliteColor } from '../game/enemies';
import {
  laneX,
  OB_VIS,
  ELITE_AURA_SCALE,
  ELITE_AURA_ALPHA,
  WINDUP_RING_SCALE,
  WINDUP_RING_GROW,
  WINDUP_RING_FADE,
  WINDUP_RING_WIDTH,
  ENEMY_SHIP_VIS,
  ENEMY_SHIPS,
  ShotArt,
  BOSS_MINI_IMG,
  BOSS_GIANT_IMG,
  BOSS_MINI_VIS,
  BOSS_GIANT_VIS,
  PALETTE,
} from '../game/constants';
import PickupView, { PickupPhase } from './Pickup';

/**
 * The charge tell for anything that winds a shot up — the Sniper archetype and
 * a boss in a telegraphed phase.
 *
 * Sized and centred against the sprite it belongs to rather than against a
 * fixed pixel box, because the two callers differ by more than 3× in width. A
 * plain function rather than a component: `ObstacleView` re-renders every frame
 * by design (see the note on the memo below), and `windup` changes every one of
 * those frames, so a `React.memo` boundary here would only add a comparison
 * that can never hit.
 *
 * `box` is the parent's square footprint; the ring positions itself inside it,
 * which is what lets the same call work in the flex-centred emoji wrapper and
 * in the boss wrapper that does no centring at all.
 */
const windupRing = (box: number, windup: number) => {
  const d = box * WINDUP_RING_SCALE;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (box - d) / 2,
        top: (box - d) / 2,
        width: d,
        height: d,
        borderRadius: d / 2,
        borderWidth: WINDUP_RING_WIDTH,
        borderColor: PALETTE.threat, // winding up is a threat, not a reward
        opacity: Math.max(0.35, 0.95 - windup * WINDUP_RING_FADE),
        transform: [{ scale: 1 + windup * WINDUP_RING_GROW }],
      }}
    />
  );
};

// Instantly readable obstacles — no text to parse at game speed.
// Enemy ship = shoot it; every falling drop is handed to PickupView.
function ObstacleView({
  ob,
  avatarShot,
  phase,
}: {
  ob: Card;
  avatarShot?: ShotArt;
  /**
   * This card's slice of the one shared idle loop, for the drop types that
   * float. Omitted when motion is off — reduce-motion, or a governor tier
   * above 0 — and ignored entirely by enemies, which have their own behaviour.
   */
  phase?: PickupPhase;
}) {
  // Resolved obstacles pop (scale + fade); bullet hits flash with a scale bump.
  const t = Math.min(ob.deadT / 0.18, 1);
  const scale = ob.dead ? 1 + t * 0.45 : 1 + ob.hitT * 0.9;
  const opacity = ob.dead ? 1 - t : 1;
  // Visual is centered on the (smaller) hitbox — follows a charging enemy.
  const cx = ob.cx ?? laneX(ob.lane);
  const cy = ob.y + ob.h / 2;
  const eliteTint = ob.kind === 'rage' && !ob.dead ? eliteColor(ob) : undefined;
  const showHp = ob.maxHp > 1 && !ob.dead;
  // A Shielded elite shows its shield pool INSTEAD of its hull bar while the
  // shield holds — two stacked bars read as noise, and the shield is the one
  // the player needs to break first.
  const shieldUp = (ob.shieldHp ?? 0) > 0 && (ob.shieldMax ?? 0) > 0;
  const hpBar = showHp && (
    <View style={styles.hpTrack}>
      <View
        style={[
          shieldUp ? styles.shieldFill : styles.hpFill,
          {
            width: shieldUp
              ? `${(Math.max(0, ob.shieldHp!) / ob.shieldMax!) * 100}%`
              : `${(Math.max(0, ob.hp) / ob.maxHp) * 100}%`,
          },
        ]}
      />
    </View>
  );

  // --- Pickups: one system for all four drop types ---
  // Boons, coins, hearts and gun drops used to be four branches in this file
  // with three footprints and two glow systems between them. They are one
  // component now — see Pickup.tsx for the shape language and why the idle
  // motion is driven from a single shared value rather than per pickup.
  if (ob.kind === 'boon' || ob.kind === 'coin' || ob.kind === 'heart' || ob.kind === 'gift') {
    return <PickupView ob={ob} avatarShot={avatarShot} phase={phase} />;
  }

  if (ob.kind === 'rage' && ob.boss) {
    // Boss: one big monster, rendered well above the (forgiving) hitbox.
    const vis = ob.boss === 'giant' ? BOSS_GIANT_VIS : BOSS_MINI_VIS;
    return (
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: vis,
          height: vis,
          opacity,
          transform: [
            { translateX: cx - vis / 2 },
            { translateY: cy - vis / 2 },
            { scale },
          ],
        }}
        pointerEvents="none"
      >
        {hpBar}
        {/* The boss telegraph. This branch returns early, so it needs its own
            copy — the ring further down belongs to the non-boss tree and never
            rendered here. A boss set `windup` faithfully and nothing drew it,
            which left the giant's final phase throwing an unannounced aimed
            salvo while the code's own fairness argument claimed otherwise. */}
        {(ob.windup ?? 0) > 0 && windupRing(vis, ob.windup!)}
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
          opacity,
          transform: [
            { translateX: cx - OB_VIS / 2 },
            { translateY: cy - OB_VIS / 2 },
            { scale },
          ],
        },
      ]}
      pointerEvents="none"
    >
      {hpBar}
      {/* Elite aura: a tinted halo naming the modifier by colour, so an elite
          is spotted before it does anything. */}
      {eliteTint && (
        <View
          style={[
            styles.eliteAura,
            {
              backgroundColor: eliteTint,
              width: OB_VIS * ELITE_AURA_SCALE,
              height: OB_VIS * ELITE_AURA_SCALE,
              borderRadius: (OB_VIS * ELITE_AURA_SCALE) / 2,
            },
          ]}
        />
      )}
      {/* A sniper's charge, drawn as a tightening bright ring. The fast shot
          that follows is only fair because this telegraphs it. */}
      {(ob.windup ?? 0) > 0 && windupRing(OB_VIS, ob.windup!)}
      {/* A teleporter's arrival flash. */}
      {(ob.blinkFlash ?? 0) > 0 && (
        <View style={[styles.blinkFlash, { opacity: (ob.blinkFlash ?? 0) / 0.22 }]} />
      )}
      <Image
        source={ENEMY_SHIPS[Math.min(ob.shipIdx ?? 0, ENEMY_SHIPS.length - 1)]}
        style={styles.enemyShip}
        resizeMode="contain"
        fadeDuration={0}
      />
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
    backgroundColor: PALETTE.threat,
  },
  shieldFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: PALETTE.threatDeep, // an ENEMY's shield pool
  },
  // --- Elite / archetype tells ---
  eliteAura: {
    position: 'absolute',
    opacity: ELITE_AURA_ALPHA,
  },
  blinkFlash: {
    position: 'absolute',
    width: OB_VIS,
    height: OB_VIS,
    borderRadius: OB_VIS / 2,
    backgroundColor: PALETTE.threat, // a teleporter arriving
  },
  // --- Emoji obstacles (rage / moment / gift) ---
  // Parked at the origin and moved by translate: obstacles move every frame, and
  // left/top would re-run layout on this whole subtree each time.
  emojiWrap: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: OB_VIS,
    height: OB_VIS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enemyShip: {
    width: ENEMY_SHIP_VIS,
    height: ENEMY_SHIP_VIS,
  },
});
