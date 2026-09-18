import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import { GunKind, FloatText, SpecialKind } from '../game/types';
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
  SPECIAL_SURFACE,
  SPECIAL_GLYPH_SIZE,
  SPECIAL_GLYPH_SCRIM,
  SPECIAL_GLYPH_DISC,
  SPECIAL_GLYPH_DIM,
  SPECIAL_OVER_RING_INSET,
  SPECIAL_OVER_RING_W,
  SPECIALS,
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

/**
 * The HUD's backing — a fade across the top band.
 *
 * Regions A, B and D, the pause button and the boss bar all live in the top
 * ~130px. So does the formation: FORMATION_TOP is 150, an enemy is OB_VIS tall
 * and an elite's aura is ELITE_AURA_SCALE (1.5×) that, so the top row already
 * reaches up to y≈112 — through the wallet — and EVERY wave descends through
 * the whole band on its way in. Over a bright nebula with a red elite sitting
 * behind it, the altitude readout is simply not legible.
 *
 * A fade rather than moving the formation down, deliberately: FORMATION_TOP is
 * a DIFFICULTY number — it decides how much sky the player gets to react in —
 * and a readability problem must never be paid for with reaction time.
 *
 * Stacked bands rather than a gradient because the project has no gradient
 * dependency, and react-native-svg is kept out of the play field on purpose
 * (see PERF_AUDIT.md). Eight static views, mounted once. This component takes
 * no props, so it renders exactly once per run and costs nothing per frame.
 */
const SCRIM_ALPHAS = [0.55, 0.5, 0.44, 0.37, 0.29, 0.2, 0.11, 0.04];
const SCRIM_BAND_H = 17;

export const TopScrim = React.memo(function TopScrim() {
  return (
    <View pointerEvents="none" style={styles.scrimWrap}>
      {SCRIM_ALPHAS.map((a, i) => (
        <View key={i} style={[styles.scrimBand, { top: i * SCRIM_BAND_H, opacity: a }]} />
      ))}
    </View>
  );
});

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
/**
 * The FIRE button — the equipped hull's ultimate.
 *
 * It wears the SPECIAL'S OWN mark and colour rather than the word FIRE, so the
 * HUD changes when a hull is bought and not only the stat line. Both come from
 * SPECIALS, keyed off `kind`, which is also all this component needs to know:
 * the label, the glyph and the accent are one lookup, and a sixth ship cannot
 * reach this file without having declared them.
 *
 * THREE STATES, AND WHY NONE OF THEM IS ONLY A COLOUR
 *
 * A colourblind player has to read this mid-fight, so every state carries a
 * second, non-colour signal:
 *
 *   charging     2px pale rim · glyph dimmed · no name · meter below full
 *   armed        3px ACCENT rim · glyph at full · the attack is NAMED · throb
 *   overcharged  3.5px gold rim · a SECOND RING inside it · name gains a "+"
 *
 * The inner ring is the one that had to be added: armed and overcharged used
 * to differ by hue and half a pixel of border, and half a pixel is not a
 * signal.
 *
 * WHAT MUST NOT CHANGE HERE
 *
 * `charge` is an Animated.Value the game loop writes with setValue() sixty
 * times a second, and nothing in this component may pull it onto the React
 * render path. Everything derived from it is an interpolation built ONCE per
 * render, and this subtree renders a handful of times a run — when `ready` or
 * `overcharged` flip, and when the player changes ship.
 */
interface SpecialButtonProps {
  charge: Animated.Value; // 0 = empty, 1 = armed, 2 = overcharged; drives level AND colour
  pulse: Animated.Value; // gentle scale throb once it's ready, so it asks to be tapped
  /** Meter banked past full — firing now gives the enhanced version. */
  overcharged: boolean;
  ready: boolean;
  /** The equipped hull's ultimate: picks the glyph, the accent and the name. */
  kind: SpecialKind;
  onPress: () => void;
}

export const SpecialButton = React.memo(function SpecialButton({
  charge,
  pulse,
  overcharged,
  ready,
  kind,
  onPress,
}: SpecialButtonProps) {
  const special = SPECIALS[kind];
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
  // White at empty, the ability's own colour at full, amber once banked past
  // it — so a full button is already wearing what the ability will look like.
  const fillColor = charge.interpolate({
    inputRange: [0, 1, ENERGY_OVERCHARGE],
    outputRange: [SPECIAL_FILL_EMPTY, special.accent, OVERCHARGE_FILL],
    extrapolate: 'clamp',
  });
  // The RIM TRACKS THE FILL, and this is a fix rather than a flourish.
  //
  // The rim used to be a static colour picked from the `ready`/`overcharged`
  // booleans, which only flip at charge 1 and charge 2 — while the fill ramps
  // CONTINUOUSLY from the ability's accent toward the overcharge amber across
  // that whole band. So for the entire time a player is banking charge (which
  // is most of the time a button is armed) the button wore two unrelated
  // colours at once: a teal rim around an amber body on Specter, violet around
  // amber on Raptor. It read as a rendering fault because, in effect, it was.
  //
  // Sharing one input range means rim and fill are always the same hue family:
  // both sit on the ability's accent at armed, both arrive on gold together.
  const rimColor = charge.interpolate({
    inputRange: [0, 1, ENERGY_OVERCHARGE],
    // Permitted neutral lift (VISUAL_SPEC §3) — the idle rim is not a brand colour.
    outputRange: ['rgba(255,255,255,0.28)', special.accent, OVERCHARGE_EDGE],
    extrapolate: 'clamp',
  });
  return (
    <Animated.View style={[styles.specialWrap, { transform: [{ scale: pulse }] }]}>
      <Pressable
        testID="special"
        onPress={onPress}
        disabled={!ready}
        hitSlop={8}
        accessibilityRole="button"
        // The glyph replaced the only text this button had, so its name has
        // to be stated rather than read off a label. State goes in the name
        // too: a screen reader user gets the same three-way read the rim and
        // the ring give everyone else.
        accessibilityLabel={`${special.name}${overcharged ? ' overcharged' : ready ? ' ready' : ' charging'}`}
        style={({ pressed }) => [styles.specialBtn, pressed && styles.specialPressed]}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.specialFill, { backgroundColor: fillColor, transform: [{ translateY: level }] }]}
        >
          {/* A bright line riding the top of the fill — the liquid's surface. */}
          <View style={styles.specialSurface} />
        </Animated.View>
        {/* The glyph rides a dark disc: the fill slides up THROUGH it and ends
            on the ability's own colour, which white ink would vanish into. */}
        <View pointerEvents="none" style={styles.specialGlyph}>
          <Icon
            name={special.icon}
            size={SPECIAL_GLYPH_SIZE}
            color={PALETTE.ink}
            opacity={ready ? 1 : SPECIAL_GLYPH_DIM}
          />
        </View>
      </Pressable>
      {/* Armed buttons name the attack; an overcharged one advertises that
          holding on paid off, which is the whole point of banking it.

          The name sits BELOW the button now, on its own dark pill. It used to
          be bare ink inside the circle, sharing the flex column with a 46px
          glyph disc — which left it a few pixels off a 3.5px rim, so it ran
          into the border. Widening it was not an option either: the longest
          names are NOVA BURST and SPEAR RAIN, and ten characters cannot fit
          across a 76px circle at a legible size, which is why the type had
          been pushed to 8.5px and still clipped.

          Outside the circle it has the whole screen width, so it can go back
          up to a readable size, it can never collide with the rim, and the
          glyph gets the button to itself and is finally centred in it. */}
      {ready && (
        <View pointerEvents="none" style={styles.specialNameWrap}>
          <View style={styles.specialNamePill}>
            <Text
              style={[styles.specialReadyTxt, overcharged && styles.specialOverTxt]}
              numberOfLines={1}
            >
              {overcharged ? `${special.name} +` : special.name}
            </Text>
          </View>
        </View>
      )}
      {/* The rim and the overcharge ring sit OUTSIDE the Pressable, drawn over
          it. The rim used to be the Pressable's own border, on a view that
          also has `overflow: hidden` to clip the rising fill — so the fill was
          clipped to the padding box and left a hairline seam against the
          inside of the border, which is the ragged edge this button had at
          every charge level. Drawn as an overlay there is nothing to clip
          against: the fill runs the full circle and the rim lands on top of it. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.specialRim,
          ready && styles.specialRimReady,
          overcharged && styles.specialRimOver,
          { borderColor: rimColor },
        ]}
      />
      {/* The overcharge ring. A shape the other two states do not have, so
          the strongest state is legible without reading its colour. */}
      {overcharged && <View pointerEvents="none" style={styles.specialOverRing} />}
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
  // --- The top fade (see TopScrim) ---
  scrimWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: SCRIM_ALPHAS.length * SCRIM_BAND_H,
  },
  scrimBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: SCRIM_BAND_H,
    backgroundColor: PALETTE.void,
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
  // Enemies-remaining pips are DOTS, not bars, and that is the whole point:
  // the health bar at the bottom of the screen is a row of threat-red bars,
  // and a row of threat-red bars up here read as the same object at arm's
  // length. Both have to stay in the hostile family — one counts things that
  // can kill you, the other counts how much of you is left — so the thing that
  // has to differ is the SHAPE. Round means "them", rectangular means "you".
  pipRow: { flexDirection: 'row', gap: 3, marginTop: 5 },
  pip: { width: 5, height: 5, borderRadius: 2.5 },
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
  // Depth is secondary, but it still has to be READABLE — inkMute against a
  // bright nebula (or an elite's aura, which reaches into this region) was
  // below any usable contrast. One step up the ink ramp plus the same shadow
  // every other HUD number carries; it stays clearly subordinate to the coins
  // above it because it is smaller, dimmer and unglyphed.
  alt: {
    color: PALETTE.inkDim,
    fontSize: 12,
    fontFamily: FONTS.display,
    letterSpacing: 0.8,
    marginTop: 1,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
  // Sized explicitly, because the rim and the overcharge ring are now absolute
  // siblings of the button rather than children of it.
  specialWrap: {
    position: 'absolute',
    right: SPECIAL_BTN_RIGHT,
    bottom: SPECIAL_BTN_BOTTOM,
    width: SPECIAL_BTN_SIZE,
    height: SPECIAL_BTN_SIZE,
  },
  specialBtn: {
    width: SPECIAL_BTN_SIZE,
    height: SPECIAL_BTN_SIZE,
    borderRadius: SPECIAL_BTN_SIZE / 2,
    overflow: 'hidden', // clips the rising fill slab to the circle
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The state rim, drawn over the button. Only its WIDTH is a discrete style —
  // the colour is animated off `charge` so it can never disagree with the fill.
  specialRim: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    borderRadius: SPECIAL_BTN_SIZE / 2,
    borderWidth: 2,
  },
  specialRimReady: { borderWidth: 3 },
  specialRimOver: { borderWidth: 3.5 },
  // Parked a full diameter down (empty) and slid up to 0 as the meter fills.
  // Fully opaque: at 0.9 the ability's accent was being cut with the button's
  // own black backing, which turned Nova's gold and the overcharge amber into
  // a muddy brown. The backing's job is to show where the fill ISN'T.
  specialFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: SPECIAL_BTN_SIZE,
  },
  specialSurface: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: SPECIAL_SURFACE,
  },
  // The dark lens the glyph sits on. Centred by the button's own
  // alignItems/justifyContent, so it needs no offsets of its own.
  specialGlyph: {
    width: SPECIAL_GLYPH_DISC,
    height: SPECIAL_GLYPH_DISC,
    borderRadius: SPECIAL_GLYPH_DISC / 2,
    backgroundColor: SPECIAL_GLYPH_SCRIM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  specialOverRing: {
    position: 'absolute',
    left: SPECIAL_OVER_RING_INSET,
    top: SPECIAL_OVER_RING_INSET,
    right: SPECIAL_OVER_RING_INSET,
    bottom: SPECIAL_OVER_RING_INSET,
    borderRadius: SPECIAL_BTN_SIZE / 2,
    borderWidth: SPECIAL_OVER_RING_W,
    borderColor: OVERCHARGE_EDGE,
  },
  // Below the button, centred on it, and allowed to overhang on both sides —
  // the wrap does not clip, so a name wider than the circle is fine.
  specialNameWrap: {
    position: 'absolute',
    top: SPECIAL_BTN_SIZE + 6,
    left: -24,
    right: -24,
    alignItems: 'center',
  },
  // The name's backing: a guaranteed dark surface over live gameplay, so the
  // label reads over a nebula, an explosion or the player's own hull.
  specialNamePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(5,7,14,0.62)',
  },
  // Gold rather than near-black: the pill guarantees a dark backing now, so
  // overcharge can reinforce its colour instead of inverting to stay legible.
  specialOverTxt: {
    color: PALETTE.goldHi,
  },
  // Back up to the spec's `micro` size (VISUAL_SPEC §4 sets 10.5 as the floor
  // for a label) — it was only ever at 8.5 to survive being trapped inside the
  // circle, and outside it there is no reason to keep it there.
  specialReadyTxt: {
    color: PALETTE.ink,
    fontSize: 10.5,
    fontFamily: FONTS.display,
    letterSpacing: 1.1,
  },
  specialPressed: { opacity: 0.7 },
});
