import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import { GunKind, FloatText } from '../game/types';
import { ActiveBoons, BOONS, TIMED_BOONS } from '../game/pickups';
import { bossPhaseCount } from '../game/bosses';
import {
  PALETTE,
  GUN_LABEL,
  SCREEN,
  HEARTS_MAX,
  BOON_CHIP_MAX,
  WAVE_MAX_ENEMIES,
  SPECIAL_BTN_SIZE,
  SPECIAL_BTN_RIGHT,
  SPECIAL_BTN_BOTTOM,
  SPECIAL_FILL_EMPTY,
  SPECIAL_FILL_MID,
  SPECIAL_FILL_FULL,
  SPECIAL_READY_EDGE,
  SPECIAL_SURFACE,
  ENERGY_OVERCHARGE,
  OVERCHARGE_EDGE,
  OVERCHARGE_FILL,
  CHAIN_HUD_COLOR,
  CHAIN_HUD_HOT,
} from '../game/constants';
import { FONTS, TYPE } from '../game/type';
import CoinIcon from './Coin';
import Icon, { IconName } from './Icon';
import { ChipSlide, useReduceMotion } from './Motion';

// Particles moved to ParticleLayer, which pools its views and is driven
// imperatively — they were the largest per-frame reconciliation cost.

// --- Floating score text ("+30", "CLOSE ONE") ---
export function FloatTextView({ f }: { f: FloatText }) {
  return (
    <Text
      pointerEvents="none"
      style={[
        styles.floatText,
        {
          color: f.color,
          opacity: Math.min(f.life * 2, 1),
          // Translated, not positioned: a float drifts every frame, and left/top
          // would re-measure the text box on each one.
          transform: [{ translateX: f.x - 60 }, { translateY: f.y }],
        },
      ]}
    >
      {f.text}
    </Text>
  );
}

// --- HUD ---
// SCORE takes the headline slot: it is the thing that measures how the run is
// being played. Altitude drops to a small depth readout beneath it — it used to
// be the score, but a number that only counts seconds elapsed can't be one.
interface HUDProps {
  score: number;
  coins: number;
  alt: number; // metres climbed — depth/pace, not skill
  gun: GunKind;
  gunTime: number; // seconds left on a gift gun
  gunLevel: number;
  /** Active utility pickups → seconds remaining. */
  boons: ActiveBoons;
  /** Chain multiplier, and 0..1 of the window left before it decays. */
  multiplier: number;
  chainFrac: number;
  /**
   * A cheap signature of everything in `boons` this HUD actually DRAWS.
   *
   * The loop mutates `boons` in place, so the object reference is identical
   * frame after frame and no shallow prop comparison can tell that a boon
   * started, ticked a second down, or expired. The caller builds this key from
   * the same values the chips display (see boonChipKey), which is what lets the
   * memo below skip the ~95% of frames on which nothing in here changed.
   *
   * Optional: rendered directly in tests, where every render is a fresh mount
   * and the memo never applies.
   */
  boonKey?: string;
}

function HUDBase({
  score,
  coins,
  alt,
  gun,
  gunTime,
  gunLevel,
  boons,
  multiplier,
  chainFrac,
}: HUDProps) {
  // The HUD re-renders on the loop's frame, so anything non-trivial in this
  // body runs sixty times a second. Intl formatting is one of the most
  // expensive things available in a Hermes hot path, and the score changes a
  // few times a run — so it is formatted when it changes, not when it is drawn.
  const scoreText = useMemo(() => score.toLocaleString(), [score]);
  // Longest-remaining first, so the chip about to disappear sits at the end and
  // the row doesn't reshuffle as timers tick past one another. Runs only when
  // the memo below has decided something actually changed, so this is a
  // per-CHANGE cost now rather than a per-frame one.
  const active = TIMED_BOONS.filter((k) => (boons[k] ?? 0) > 0)
    .sort((a, b) => (boons[b] ?? 0) - (boons[a] ?? 0))
    .slice(0, BOON_CHIP_MAX);
  const hot = multiplier >= 5;
  const reduceMotion = useReduceMotion();
  return (
    <>
      {/* REGION A — score, top-left. Its height is CONSTANT: the chain slot is
          always rendered and only its CONTENTS fade in and out. Conditionally
          rendering the row (which is what shipped) made every element below it
          jump the instant the player got a second kill — layout instability
          during combat, which is the worst readability failure available. */}
      <View style={styles.regionA} pointerEvents="none">
        <Text style={styles.score}>{scoreText}</Text>
        <View style={styles.chainSlot}>
          <View style={[styles.chainRow, { opacity: multiplier > 1 ? 1 : 0 }]}>
            <Text style={[styles.chainMult, hot && styles.chainMultHot]}>×{multiplier}</Text>
            <View style={styles.chainTrack}>
              <View
                style={[
                  styles.chainFill,
                  { width: `${Math.max(0, Math.min(1, chainFrac)) * 100}%` },
                  hot && styles.chainFillHot,
                ]}
              />
            </View>
          </View>
        </View>
      </View>

      {/* REGION D — wallet, top-right, right-aligned. Moved out of the score
          column so nothing in it can be pushed around by the chain. */}
      <View style={styles.regionD} pointerEvents="none">
        <View style={styles.coinRow}>
          <CoinIcon size={14} />
          <Text style={styles.coins}>{coins}</Text>
        </View>
        <Text style={styles.alt}>{Math.max(0, Math.round(alt))}m</Text>
      </View>

      {/* REGION E — status chips, bottom-left. Boons and the gun timer are one
          system, so they share one component and one column. Fixed slot heights,
          so a chip appearing or expiring never shoves its neighbours. */}
      <View style={styles.regionE} pointerEvents="none">
        {active.map((k) => (
          <ChipSlide key={k} reduceMotion={reduceMotion}>
          <StatusChip
            color={BOONS[k].color}
            icon={BOONS[k].icon}
            label={BOONS[k].name.toUpperCase()}
            value={Math.ceil(boons[k] ?? 0)}
          />
          </ChipSlide>
        ))}
        {/* Always mounted, faded when idle — same reasoning as the chain slot. */}
        <View style={{ opacity: gun !== 'single' ? 1 : 0 }}>
          {/* Plasma, not amber: the chip is meant to match the bolts you see
              leaving the ship, and the starter hull's shot is plasma. */}
          <StatusChip
            color={PALETTE.plasma}
            icon="gun-double"
            label={`${GUN_LABEL[gun] ?? ''}${gunLevel > 1 ? ` ×${gunLevel}` : ''}`}
            value={Math.max(0, Math.ceil(gunTime))}
          />
        </View>
      </View>
    </>
  );
}

/**
 * Build the HUD's boon signature — see HUDProps.boonKey.
 *
 * Deliberately keyed off the DISPLAYED value (`Math.ceil`), not the raw float:
 * a chip reading "4" is the same pixels whether 4.0 or 3.2 seconds remain, so
 * the HUD only needs to redraw when the number the player sees changes — about
 * once a second per chip instead of sixty times.
 */
export function boonChipKey(boons: ActiveBoons): string {
  let key = '';
  for (const k of TIMED_BOONS) {
    const t = boons[k] ?? 0;
    if (t > 0) key += `${k}${Math.ceil(t)},`;
  }
  return key;
}

/**
 * The HUD redraws only when something it DRAWS has changed.
 *
 * It was re-rendering on every frame of the loop — the only unmemoized consumer
 * left in this file — rebuilding a couple of dozen elements plus a filter and a
 * sort, sixty times a second, to paint numbers that change a few times a run.
 *
 * A plain React.memo could not fix that: `alt` and `gunTime` are raw floats that
 * differ every single frame, and `boons` is mutated in place so its reference
 * never differs at all. The comparison therefore has to run on the QUANTISED
 * values — exactly what each field is rounded to at the point it is drawn.
 * Keep the two in sync: if a field's display rounding changes, change it here.
 */
export const HUD = React.memo(HUDBase, (a, b) => {
  return (
    a.score === b.score &&
    a.coins === b.coins &&
    a.gun === b.gun &&
    a.gunLevel === b.gunLevel &&
    a.multiplier === b.multiplier &&
    // …matching `Math.max(0, Math.round(alt))` in REGION D
    Math.max(0, Math.round(a.alt)) === Math.max(0, Math.round(b.alt)) &&
    // …and `Math.max(0, Math.ceil(gunTime))` on the gun chip
    Math.max(0, Math.ceil(a.gunTime)) === Math.max(0, Math.ceil(b.gunTime)) &&
    // The chain bar is a percentage width, so whole percents are all it can
    // actually show. This is the one field that still changes most frames while
    // a chain is live — but only while one is live.
    Math.round(Math.max(0, Math.min(1, a.chainFrac)) * 100) ===
      Math.round(Math.max(0, Math.min(1, b.chainFrac)) * 100) &&
    a.boonKey === b.boonKey
  );
});

/**
 * REGION B — the wave label and an enemies-remaining pip strip.
 *
 * The player previously had no way to know how close a wave was to clearing
 * except by scanning the board. Filled pip = alive, empty = killed, so progress
 * through the formation is readable without counting ships.
 */
export const WaveHeader = React.memo(function WaveHeader({
  wave,
  alive,
  total,
  boss,
}: {
  wave: number;
  alive: number;
  total: number;
  /** Boss waves replace the pip strip with the boss's name. */
  boss?: 'mini' | 'giant';
}) {
  if (wave < 1) return null;
  // Capped at WAVE_MAX_ENEMIES; above that a strip of pips stops being countable
  // and a bare count reads better.
  const showPips = !boss && total > 0 && total <= WAVE_MAX_ENEMIES;
  return (
    <View style={styles.regionB} pointerEvents="none">
      <Text style={styles.waveLabel}>WAVE {wave}</Text>
      {boss ? (
        <Text style={styles.waveBoss}>{boss === 'giant' ? 'GIANT BOSS' : 'MINI BOSS'}</Text>
      ) : showPips ? (
        <View style={styles.pipRow}>
          {Array.from({ length: total }, (_, i) => (
            <View key={i} style={[styles.pip, i < alive ? styles.pipAlive : styles.pipDead]} />
          ))}
        </View>
      ) : (
        <Text style={styles.waveBoss}>{alive} LEFT</Text>
      )}
    </View>
  );
});

/**
 * The boss health bar.
 *
 * Segmented into phase blocks (3 for a giant, 1 for a mini) and backed by a
 * lagging "damage ghost" that eases down to the true value, so a big hit reads
 * as a big hit rather than as a bar quietly being shorter than it was.
 */
export const BossBar = React.memo(function BossBar({
  hp,
  maxHp,
  kind,
}: {
  hp: number;
  maxHp: number;
  kind: 'mini' | 'giant';
}) {
  const frac = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
  // Segment count comes from the PHASE TABLE, not a literal. The bar used to
  // hardcode 3-for-giant / 1-for-mini and the simulation had no phases at all,
  // so it drew an escalation that never happened. Reading BOSS_PHASES means the
  // blocks and the boss's actual behaviour can no longer disagree.
  const blocks = bossPhaseCount(kind);
  // Which phase block the boss is currently inside, counting down from the top.
  const phase = Math.max(1, Math.ceil(frac * blocks));
  const ghost = useRef(new Animated.Value(frac)).current;

  useEffect(() => {
    Animated.timing(ghost, {
      toValue: frac,
      duration: 300,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [frac, ghost]);

  return (
    <View style={styles.bossWrap} pointerEvents="none">
      <View style={styles.bossLabels}>
        <Text style={styles.bossName}>{kind === 'giant' ? 'GIANT BOSS' : 'MINI BOSS'}</Text>
        {blocks > 1 && <Text style={styles.bossPhase}>PHASE {blocks - phase + 1}</Text>}
      </View>
      <View style={styles.bossTrack}>
        {/* The ghost sits BEHIND the fill and catches up over ~300ms. */}
        <Animated.View
          style={[
            styles.bossGhost,
            { width: ghost.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
        <View style={[styles.bossFill, { width: `${frac * 100}%` }]} />
        {/* Phase dividers, drawn over the fill so the blocks stay legible. */}
        {Array.from({ length: blocks - 1 }, (_, i) => (
          <View key={i} style={[styles.bossDivider, { left: `${((i + 1) / blocks) * 100}%` }]} />
        ))}
      </View>
    </View>
  );
});

/**
 * One status chip — a boon timer or the gun timer.
 *
 * A 2px left rail in the family colour carries the categorisation, so the chip
 * reads as offensive/defensive/control before the label is parsed. The glyph is
 * still an emoji; it becomes a tinted 9px icon once the icon set lands.
 */
function StatusChip({
  color,
  icon,
  label,
  value,
}: {
  color: string;
  icon: IconName;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.chip}>
      <View style={[styles.chipRail, { backgroundColor: color }]} />
      <Icon name={icon} size={9} color={color} />
      <Text style={styles.chipTxt} numberOfLines={1}>
        {label} {value}
      </Text>
    </View>
  );
}

// --- Health bar: one countable segment per heart ---
//
// This was a continuous 16-band faked gradient down the left edge, which asked
// the player to judge a *proportion* to work out how many discrete hearts they
// had left — and sat at 36% down the screen, level with the enemy formation
// rather than with the ship they were actually watching.
//
// Now: one segment per heart, centred just beneath the ship's rest position.
// Countable at a glance, and in the same place the player's eyes already are.
//
// `maxHearts` is the run's LIVE ceiling, not the global constant — the Extra
// Heart boon raises it mid-run, and drawing against HEARTS_MAX would render an
// over-full bar the moment it does.
//
// Memoized: the parent re-renders every frame, but health changes only on a hit
// or a pickup, so this should reconcile then and not 60×/sec.
export const HealthBar = React.memo(function HealthBar({
  hearts,
  maxHearts = HEARTS_MAX,
}: {
  hearts: number;
  maxHearts?: number;
}) {
  const total = Math.max(1, Math.floor(maxHearts));
  const filled = Math.max(0, Math.min(total, Math.floor(hearts)));
  return (
    <View style={styles.hpWrap} pointerEvents="none">
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.hpSeg, i < filled ? styles.hpSegFull : styles.hpSegEmpty]} />
      ))}
    </View>
  );
});

// --- FIRE button: the equipped ship's special ---
// An empty vessel that refills on its own and lights up when it tops out. The
// fill is driven by an Animated.Value the game loop writes with setValue(), so
// the meter climbs on the NATIVE side with no React render per frame — the same
// trick the parallax layers use. Memoized on primitives so this subtree
// reconciles only when the button actually changes state (locked → charging →
// ready), not on the parent's per-frame render.
interface SpecialButtonProps {
  charge: Animated.Value; // 0 = empty, 1 = armed, 2 = overcharged; drives level AND colour
  pulse: Animated.Value; // gentle scale throb once it's ready, so it asks to be tapped
  /** Meter banked past full — firing now gives the enhanced version. */
  overcharged: boolean;
  ready: boolean;
  label: string; // the special's name, shown under FIRE once it's armed
  onPress: () => void;
}

export const SpecialButton = React.memo(function SpecialButton({
  charge,
  pulse,
  overcharged,
  ready,
  label,
  onPress,
}: SpecialButtonProps) {
  // One value drives the whole meter. The slab is a full diameter tall and
  // slides up from parked-below into place, so the level and its colour can
  // never drift apart. Built here rather than per frame: the loop only ever
  // writes `charge`, and this component re-renders a handful of times a run.
  // The slab tops out at charge 1 and STAYS full through the overcharge band —
  // past full, the extra is signalled by colour and the rim rather than by a
  // level that would have nowhere left to climb.
  const level = charge.interpolate({
    inputRange: [0, 1, ENERGY_OVERCHARGE],
    outputRange: [SPECIAL_BTN_SIZE, 0, 0],
    extrapolate: 'clamp',
  });
  const fillColor = charge.interpolate({
    inputRange: [0, 0.5, 1, ENERGY_OVERCHARGE],
    outputRange: [SPECIAL_FILL_EMPTY, SPECIAL_FILL_MID, SPECIAL_FILL_FULL, OVERCHARGE_FILL],
    extrapolate: 'clamp',
  });
  return (
    <Animated.View style={[styles.specialWrap, { transform: [{ scale: pulse }] }]}>
      <Pressable
        onPress={onPress}
        disabled={!ready}
        hitSlop={8}
        style={({ pressed }) => [
          styles.specialBtn,
          ready && styles.specialBtnReady,
          overcharged && styles.specialBtnOver,
          pressed && styles.specialPressed,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.specialFill, { backgroundColor: fillColor, transform: [{ translateY: level }] }]}
        >
          {/* A bright line riding the top of the fill — the liquid's surface. */}
          <View style={styles.specialSurface} />
        </Animated.View>
        <Text style={styles.specialTxt}>FIRE</Text>
        {/* Armed buttons name the attack; an overcharged one advertises that
            holding on paid off, which is the whole point of banking it. */}
        {ready && (
          <Text
            style={[styles.specialReadyTxt, overcharged && styles.specialOverTxt]}
            numberOfLines={1}
          >
            {overcharged ? `${label} +` : label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  floatText: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 120,
    textAlign: 'center',
    ...TYPE.title,
    fontSize: 17,
  },
  // --- REGION A: score + reserved chain slot (top-left) ---
  regionA: {
    position: 'absolute',
    top: 44,
    left: 16,
  },
  // The reserved slot. A FIXED height is the whole fix: the chain row fades in
  // and out inside it, so nothing below region A ever moves.
  chainSlot: {
    height: 20,
    justifyContent: 'center',
  },
  // --- REGION B: wave label + enemies-remaining pips (top, centred) ---
  regionB: {
    position: 'absolute',
    top: 46,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  waveLabel: {
    color: PALETTE.ink,
    fontSize: 12,
    fontFamily: FONTS.display,
    letterSpacing: 1.9,
  },
  waveBoss: {
    color: PALETTE.threat,
    fontSize: 10.5,
    fontFamily: FONTS.display,
    letterSpacing: 1.5,
    marginTop: 3,
  },
  pipRow: { flexDirection: 'row', gap: 2.5, marginTop: 4 },
  pip: { width: 7, height: 3, borderRadius: 1 },
  pipAlive: { backgroundColor: PALETTE.threat },
  pipDead: { backgroundColor: 'rgba(255,255,255,0.15)' },
  // --- Boss bar ---
  bossWrap: {
    position: 'absolute',
    top: 108,
    left: 14,
    right: 14,
  },
  bossLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  bossName: {
    color: PALETTE.threat,
    fontSize: 10.5,
    fontFamily: FONTS.display,
    letterSpacing: 1.5,
  },
  bossPhase: {
    color: PALETTE.inkDim,
    fontSize: 10.5,
    fontFamily: FONTS.display,
    letterSpacing: 1.5,
  },
  bossTrack: {
    height: 5,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: PALETTE.threatDeep,
    backgroundColor: 'rgba(255,255,255,0.09)',
    overflow: 'hidden',
  },
  // Lags behind the real fill so a big hit is visible as a big hit.
  bossGhost: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: PALETTE.threatDeep,
  },
  bossFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: PALETTE.threat,
  },
  bossDivider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  // --- REGION D: wallet (top-right, right-aligned) ---
  regionD: {
    position: 'absolute',
    top: 84,
    right: 14,
    alignItems: 'flex-end',
  },
  // --- REGION E: status chips (bottom-left) ---
  // Anchored ABOVE the bomb button (BOMB_BTN_BOTTOM 92 + its 58px diameter), so
  // the two never overlap. The spec's ASCII layout puts the chips above the
  // buttons; its literal 'bottom: 88' would have sat behind the bomb.
  regionE: {
    position: 'absolute',
    left: 16,
    bottom: 158,
    alignItems: 'flex-start',
    gap: 4,
  },
  // Score is the headline; altitude is demoted to a depth readout in region D.
  score: {
    ...TYPE.score,
    color: PALETTE.ink,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  // --- Chain multiplier + its draining window ---
  chainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  chainMult: {
    color: CHAIN_HUD_COLOR,
    fontSize: 20,
    fontFamily: FONTS.data,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  chainMultHot: { color: CHAIN_HUD_HOT },
  chainTrack: {
    width: 74,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
    overflow: 'hidden',
  },
  chainFill: { height: '100%', borderRadius: 2, backgroundColor: CHAIN_HUD_COLOR },
  chainFillHot: { backgroundColor: CHAIN_HUD_HOT },
  // --- Region D: wallet ---
  coinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  coins: {
    color: PALETTE.gold,
    fontSize: 14,
    fontFamily: FONTS.data,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  alt: {
    color: PALETTE.inkMute,
    fontSize: 12,
    fontFamily: FONTS.display,
    letterSpacing: 0.8,
    marginTop: 1,
  },
  // --- Health: discrete, countable segments under the ship ---
  hpWrap: {
    position: 'absolute',
    bottom: SCREEN.H * 0.16,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 2.5,
  },
  hpSeg: {
    width: 13,
    height: 5,
    borderRadius: 2,
  },
  hpSegFull: {
    backgroundColor: PALETTE.threat,
    shadowColor: PALETTE.threat,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  hpSegEmpty: {
    backgroundColor: 'rgba(255,255,255,0.11)',
  },
  // --- Status chips (region E) ---
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 20,
    paddingHorizontal: 6,
    paddingLeft: 0,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    overflow: 'hidden',
    gap: 4,
  },
  // The 2px family rail: categorises the chip before the label is read.
  chipRail: {
    width: 2,
    alignSelf: 'stretch',
    marginRight: 4,
  },
  chipGlyph: { fontSize: 9 },
  chipTxt: {
    color: PALETTE.ink,
    fontSize: 9.5,
    fontFamily: FONTS.display,
    letterSpacing: 0.6,
  },
  // --- FIRE button ---
  specialWrap: {
    position: 'absolute',
    right: SPECIAL_BTN_RIGHT,
    bottom: SPECIAL_BTN_BOTTOM,
  },
  specialBtn: {
    width: SPECIAL_BTN_SIZE,
    height: SPECIAL_BTN_SIZE,
    borderRadius: SPECIAL_BTN_SIZE / 2,
    overflow: 'hidden', // clips the rising fill slab to the circle
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  specialBtnReady: {
    borderColor: SPECIAL_READY_EDGE,
    borderWidth: 3,
  },
  specialBtnOver: {
    borderColor: OVERCHARGE_EDGE,
    borderWidth: 3.5,
  },
  // Parked a full diameter down (empty) and slid up to 0 as the meter fills.
  specialFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: SPECIAL_BTN_SIZE,
    opacity: 0.9,
  },
  specialSurface: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: SPECIAL_SURFACE,
  },
  specialTxt: {
    color: PALETTE.ink,
    fontSize: 15,
    fontFamily: FONTS.display,
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  specialOverTxt: {
    color: '#221703',
  },
  specialReadyTxt: {
    color: PALETTE.ink,
    fontSize: 8.5,
    fontFamily: FONTS.display,
    letterSpacing: 0.2,
    marginTop: 1,
    paddingHorizontal: 4,
  },
  specialPressed: { opacity: 0.7 },
});
