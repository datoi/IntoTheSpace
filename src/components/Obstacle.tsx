import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Card } from '../game/types';
import { BOONS } from '../game/pickups';
import { eliteColor } from '../game/enemies';
import {
  laneX,
  OB_EMOJI,
  OB_VIS,
  BOON_VIS,
  BOON_EMOJI,
  ELITE_AURA_SCALE,
  ELITE_AURA_ALPHA,
  WINDUP_RING_SCALE,
  WINDUP_RING_GROW,
  WINDUP_RING_FADE,
  WINDUP_RING_WIDTH,
  ENEMY_SHIP_VIS,
  ENEMY_SHIPS,
  GUN_PICKUP_IMG,
  GIFT_ICON,
  GIFT_SHOT_LEN,
  ShotArt,
  BOSS_MINI_IMG,
  BOSS_GIANT_IMG,
  BOSS_MINI_VIS,
  BOSS_GIANT_VIS,
  COIN_VIS,
  HEART_ICON,
  PALETTE,
} from '../game/constants';
import CoinIcon from './Coin';
import Icon from './Icon';

const GLOW: Record<string, string> = {
  rage: PALETTE.threat, // enemy
  // Health red, matching the ❤️ it sits behind and the guide's Heart row. This
  // is `vital`, NOT `threat` — the rule is still that no pickup wears the
  // hostile crimson, it is only that health now has a red of its own.
  heart: PALETTE.vital,
  gift: PALETTE.gold,
};

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
// Enemy ship = shoot it, ❤️ = catch, 🎁 = gun.
function ObstacleView({ ob, avatarShot }: { ob: Card; avatarShot?: ShotArt }) {
  // Resolved obstacles pop (scale + fade); bullet hits flash with a scale bump.
  const t = Math.min(ob.deadT / 0.18, 1);
  const scale = ob.dead ? 1 + t * 0.45 : 1 + ob.hitT * 0.9;
  const opacity = ob.dead ? 1 - t : 1;
  // Visual is centered on the (smaller) hitbox — follows a charging enemy.
  const cx = ob.cx ?? laneX(ob.lane);
  const cy = ob.y + ob.h / 2;
  // A gun drop wears the art of the gun it grants. The 'double' drop instead
  // shows two of the avatar's own shots (what it actually doubles up on).
  const eliteTint = ob.kind === 'rage' && !ob.dead ? eliteColor(ob) : undefined;
  const isDoubleGift = ob.kind === 'gift' && ob.gun === 'double' && avatarShot != null;
  const gunImg = ob.kind === 'gift' && ob.gun && !isDoubleGift ? GUN_PICKUP_IMG[ob.gun] : undefined;
  const dShotThick = avatarShot ? GIFT_SHOT_LEN * avatarShot.aspect : 0;
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

  // --- Utility pickup: a tinted badge carrying the boon's own glyph ---
  // Rendered as a drawn badge rather than a sprite: the art pack only offers
  // three letter glyphs (P/S/U), which cannot distinguish fourteen boons, and an
  // emoji badge is both instantly readable and free of bundle weight.
  if (ob.kind === 'boon' && ob.boon) {
    const def = BOONS[ob.boon];
    return (
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: BOON_VIS,
          height: BOON_VIS,
          opacity,
          transform: [
            { translateX: cx - BOON_VIS / 2 },
            { translateY: cy - BOON_VIS / 2 },
            { scale },
          ],
          alignItems: 'center',
          justifyContent: 'center',
        }}
        pointerEvents="none"
      >
        <View style={[styles.boonGlow, { backgroundColor: def.color }]} />
        <View style={[styles.boonBadge, { borderColor: def.color }]}>
          <Icon name={def.icon} size={BOON_EMOJI} color={def.color} filled />
        </View>
      </View>
    );
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
      {/* Glow ring behind pickups — but not coins: the gold icon reads on its
          own, and the ring around it looked like a hazard. */}
      {ob.kind !== 'rage' && ob.kind !== 'coin' && (
        <>
          <View style={[styles.glow, { backgroundColor: GLOW[ob.kind] }]} />
          <View style={[styles.glowRing, { borderColor: GLOW[ob.kind] }]} />
        </>
      )}
      {ob.kind === 'rage' ? (
        <>
          {/* Elite aura: a tinted halo naming the modifier by colour, so an
              elite is spotted before it does anything. */}
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
        </>
      ) : ob.kind === 'coin' ? (
        <CoinIcon size={COIN_VIS} />
      ) : isDoubleGift && avatarShot ? (
        // Two of the avatar's own shots. The art already points up, which is
        // the way they fire, so neither needs rotating.
        <View style={styles.doubleGift}>
          {[-10, 10].map((dx, k) => (
            <Image
              key={k}
              source={avatarShot.src}
              resizeMode="contain"
              fadeDuration={0}
              style={{
                position: 'absolute',
                left: OB_VIS / 2 - dShotThick / 2 + dx,
                top: OB_VIS / 2 - GIFT_SHOT_LEN / 2,
                width: dShotThick,
                height: GIFT_SHOT_LEN,
              }}
            />
          ))}
        </View>
      ) : gunImg ? (
        // Gun-shot art points +x in the source; rotate the falling pickup so it
        // points up, like the shot it grants (the symmetric bomb blast is
        // unaffected by the rotation).
        <Image
          source={gunImg}
          style={[styles.giftIcon, { transform: [{ rotate: '-90deg' }] }]}
          resizeMode="contain"
          fadeDuration={0}
        />
      ) : ob.kind === 'heart' ? (
        <Icon name="hull" size={HEART_ICON} color={PALETTE.vital} filled />
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
  // --- Utility pickup badge ---
  boonGlow: {
    position: 'absolute',
    width: BOON_VIS,
    height: BOON_VIS,
    borderRadius: BOON_VIS / 2,
    opacity: 0.3,
  },
  boonBadge: {
    width: BOON_VIS - 8,
    height: BOON_VIS - 8,
    borderRadius: (BOON_VIS - 8) / 2,
    borderWidth: 2.5,
    backgroundColor: 'rgba(8,10,18,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boonEmoji: {
    fontSize: BOON_EMOJI,
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
  doubleGift: {
    position: 'absolute',
    width: OB_VIS,
    height: OB_VIS,
  },
});
