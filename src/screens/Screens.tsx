import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Pressable, ScrollView, Animated, Easing } from 'react-native';
import {
  PALETTE,
  AVATARS,
  BACKGROUNDS,
  COIN_GOLD,
  GUN_PICKUP_IMG,
  SPECIALS,
} from '../game/constants';
import { BOONS, BOON_KINDS } from '../game/pickups';
import { SaveData } from '../game/storage';
import { RunResult } from '../game/types';
import { ShotArt, SpecialDef } from '../game/constants';
import { FONTS, TYPE } from '../game/type';
import CoinIcon from '../components/Coin';
import Icon, { IconName } from '../components/Icon';
import { Button, IconButton } from '../components/Button';
import { RollingNumber, useReduceMotion } from '../components/Motion';

// Shop catalogs are shown cheapest-first, so the price climbs as the player
// scrolls down. Sorted once at module load (both source lists are static).
const AVATARS_BY_PRICE = [...AVATARS].sort((a, b) => a.price - b.price);
const BACKGROUNDS_BY_PRICE = [...BACKGROUNDS].sort((a, b) => a.price - b.price);

// ---------- Menu ----------
interface MenuProps {
  save: SaveData;
  /** Rewards sitting unclaimed — badged on the OBJECTIVES button. */
  rewardsWaiting?: number;
  onStart: () => void;
  onShop: () => void;
  onHangar: () => void;
  onStats: () => void;
  onQuests: () => void;
}

export function MenuScreen({
  save,
  rewardsWaiting = 0,
  onStart,
  onShop,
  onHangar,
  onStats,
  onQuests,
}: MenuProps) {
  const avatar = AVATARS.find((a) => a.id === save.selectedAvatar) ?? AVATARS[0];
  const [showGuide, setShowGuide] = useState(false);
  // A slow bob, so the hull reads as hovering rather than pasted on. Native
  // driver: the menu has no loop, and this must not cost a JS frame.
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);

  return (
    <View style={styles.screen}>
      {/* Persistent chrome: best score top-left, wallet top-right — identical
          on every screen, so the player never hunts for either. */}
      <View style={styles.menuTopBar}>
        <View>
          {save.stats.bestScore > 0 && (
            <>
              <Text style={styles.menuBestLabel}>BEST</Text>
              <Text style={styles.menuBest}>{save.stats.bestScore.toLocaleString()}</Text>
            </>
          )}
        </View>
        <View style={styles.menuWallet}>
          <CoinIcon size={13} />
          <Text style={styles.menuCoins}>{save.likes}</Text>
        </View>
      </View>

      {/* Wordmark. The accent line uses Chakra Petch's REAL italic file — the
          two lines were synthetic-slant system text before. */}
      <View style={styles.wordmark}>
        <Text style={styles.title}>INTO THE</Text>
        <Text style={[styles.title, styles.titleAccent]}>SPACE</Text>
      </View>

      {/* The hull on a glow pedestal, with its special named beneath — the menu
          now sells the ship the player is about to fly. */}
      <View style={styles.pedestal}>
        <View style={styles.pedestalGlow} />
        <Animated.View
          style={{
            transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [4, -4] }) }],
          }}
        >
          <Image source={avatar.image} style={styles.menuAvatarImg} resizeMode="contain" />
        </Animated.View>
        <Text style={styles.pedestalShip}>{avatar.name}</Text>
        <Text style={[styles.pedestalSpecial, { color: avatar.shot.tint }]}>
          {SPECIALS[avatar.special].name}
        </Text>
      </View>

      {/* ONE primary CTA. Everything else drops to the icon rail below, which
          removes five stacked elements and three competing button weights. */}
      <Button label="LIFT OFF" variant="primary" onPress={onStart} style={styles.menuCta} />

      <View style={styles.rail}>
        <IconButton icon="hangar" label="HANGAR" onPress={onHangar} />
        <IconButton icon="shop" label="SHOP" onPress={onShop} />
        <IconButton icon="objectives" label="GOALS" onPress={onQuests} badge={rewardsWaiting} />
        <IconButton icon="stats" label="STATS" onPress={onStats} />
      </View>

      <Pressable onPress={() => setShowGuide(true)} hitSlop={12} style={styles.guideLink}>
        <Icon name="info" size={12} color={PALETTE.inkDim} />
        <Text style={styles.guideLinkTxt}>PICK-UPS</Text>
      </Pressable>

      {showGuide && <PickupGuide avatarShot={avatar.shot} onClose={() => setShowGuide(false)} />}
    </View>
  );
}

// ---------- Pick-up guide ----------
// A legend the player can open from the menu, so they know what each falling
// pick-up grants before they ever grab one in the heat of a run.
interface GuideRow {
  icon: React.ReactNode;
  name: string;
  desc: string;
}

function PickupGuide({ avatarShot, onClose }: { avatarShot: ShotArt; onClose: () => void }) {
  // `rotate` is for the GUN pickup art, which still points +x. The player's own
  // bolt is real coloured art pointing up, so it needs neither tint nor rotation.
  const gunBox = (src: number, rotate?: boolean) => (
    <Image
      source={src}
      resizeMode="contain"
      style={[styles.guideIconImg, rotate && { transform: [{ rotate: '-90deg' }] }]}
    />
  );
  const rows: GuideRow[] = [
    {
      icon: gunBox(avatarShot.src, false),
      name: 'Double Fire',
      desc: 'Fires two bolts at once. Grab the same drop again to stack up to ×4.',
    },
    {
      icon: gunBox(GUN_PICKUP_IMG.bomb!, true),
      name: 'Bombs',
      desc: 'Heavy lobbed blasts that explode on impact, damaging every enemy nearby.',
    },
    {
      icon: gunBox(GUN_PICKUP_IMG.laser!, true),
      name: 'Laser',
      desc: 'A piercing beam that shoots straight through everything in its path.',
    },
    {
      icon: gunBox(GUN_PICKUP_IMG.homing!, true),
      name: 'Homing',
      desc: 'Auto-locking rockets that chase enemies down — they never miss.',
    },
    {
      icon: <Icon name="hull" size={30} color={PALETTE.vital} />,
      name: 'Heart',
      desc: 'Restores one life. You start with 3, and can hold up to 10.',
    },
    {
      icon: <CoinIcon size={30} />,
      name: 'Coin',
      desc: 'Currency — spend it in the Hangar on upgrades, or the Shop on new ships.',
    },
    // Utility pick-ups, generated straight from the catalog so the guide can
    // never fall out of step with what the game actually drops.
    ...BOON_KINDS.map((k) => ({
      icon: <Icon name={BOONS[k].icon} size={30} color={BOONS[k].color} />,
      name: `${BOONS[k].name}${BOONS[k].duration > 0 ? ` · ${BOONS[k].duration}s` : ''}`,
      desc: BOONS[k].desc,
    })),
  ];
  return (
    <View style={styles.guideOverlay}>
      <Text style={styles.guideTitle}>PICK-UPS</Text>
      <Text style={styles.guideSub}>Grab these as they fall toward you</Text>
      <ScrollView
        style={styles.guideList}
        contentContainerStyle={{ paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {rows.map((r) => (
          <View key={r.name} style={styles.guideRow}>
            <View style={styles.guideIcon}>{r.icon}</View>
            <View style={{ flex: 1 }}>
              <Text style={styles.guideName}>{r.name}</Text>
              <Text style={styles.guideDesc}>{r.desc}</Text>
            </View>
          </View>
        ))}
        <Text style={styles.guideFoot}>
          Gun pick-ups last a short while, then you drop back to your ship's default shooter.
        </Text>
        <Text style={styles.guideFoot}>
          The FIRE button is charged by KILLS and near misses, not by waiting. Every ship has its
          own special. Let it fill past full and it overcharges — a stronger version, if you can
          survive long enough to bank it.
        </Text>
        <Text style={styles.guideFoot}>
          Killing without being hit builds a CHAIN multiplier, and your score is kills × chain.
          Skimming past enemy fire keeps the chain alive — flying close to danger is how you score.
        </Text>
      </ScrollView>
      <Button label="GOT IT" variant="primary" onPress={onClose} style={styles.wideBtn} />
    </View>
  );
}

function DeepEarn({ icon, n }: { icon: IconName; n: number }) {
  return (
    <View style={styles.deepEarnItem}>
      <Icon name={icon} size={13} color={PALETTE.ink} />
      <Text style={styles.deepEarnedTxt}>+{n}</Text>
    </View>
  );
}

// ---------- Game Over ----------
interface OverProps {
  result: RunResult;
  /** Best altitude — the historical record, shown as depth. */
  best: number;
  /** Best score, the record that now leads the screen. */
  bestScore?: number;
  isNewBest: boolean;
  onRestart: () => void;
  onMenu: () => void;
}

export function GameOverScreen({ result, best, bestScore = 0, isNewBest, onRestart, onMenu }: OverProps) {
  const reduceMotion = useReduceMotion();
  return (
    <View style={styles.screen}>
      <Text style={styles.fried}>ROCKET DOWN</Text>
      {/* Score leads. It's the number that reflects how the run was played —
          altitude is shown below as depth reached, not as the score. */}
      <Text style={styles.distLabel}>SCORE</Text>
      <RollingNumber value={result.score} style={styles.bigScore} reduceMotion={reduceMotion} />
      {isNewBest ? (
        <Text style={styles.newBest}>NEW BEST</Text>
      ) : (
        <Text style={styles.overBest}>BEST {bestScore.toLocaleString()}</Text>
      )}

      {/* The breakdown: players who can see where the score came from learn how
          to score higher, and players who learn come back. */}
      <View style={styles.breakdown}>
        <View style={styles.breakRow}>
          <Text style={styles.breakLabel}>Best chain</Text>
          <Text style={styles.breakValue}>×{result.bestMult}</Text>
        </View>
        <View style={styles.breakRow}>
          <Text style={styles.breakLabel}>Grazes</Text>
          <Text style={styles.breakValue}>{result.grazes}</Text>
        </View>
        <View style={styles.breakRow}>
          <Text style={styles.breakLabel}>Depth reached</Text>
          <Text style={styles.breakValue}>
            {result.altitude}m{best > 0 ? ` · best ${best}m` : ''}
          </Text>
        </View>
        {result.wave > 0 && (
          <View style={styles.breakRow}>
            <Text style={styles.breakLabel}>Wave reached</Text>
            <Text style={styles.breakValue}>{result.wave}</Text>
          </View>
        )}
      </View>

      {/* Distance is the score; the currencies are what the run actually banked.
          Deep currencies only appear when the run earned some, so a short run
          isn't padded with a row of zeroes. */}
      <View style={styles.coinEarned}>
        <CoinIcon size={20} />
        <Text style={styles.coinEarnedTxt}>+{result.coins} COLLECTED</Text>
      </View>
      {(result.crystals > 0 || result.chips > 0 || result.alloy > 0) && (
        <View style={styles.deepEarned}>
          {result.crystals > 0 && <DeepEarn icon="crystal" n={result.crystals} />}
          {result.chips > 0 && <DeepEarn icon="chip" n={result.chips} />}
          {result.alloy > 0 && <DeepEarn icon="alloy" n={result.alloy} />}
        </View>
      )}

      <Button label="LAUNCH AGAIN" variant="primary" onPress={onRestart} style={styles.wideBtn} />
      <Button label="BACK TO MENU" variant="ghost" onPress={onMenu} />
    </View>
  );
}

// ---------- Shop ----------
type ShopTab = 'ships' | 'backgrounds';

interface ShopProps {
  save: SaveData;
  onBuyAvatar: (id: string) => void;
  onSelectAvatar: (id: string) => void;
  onBuyBackground: (id: string) => void;
  onSelectBackground: (id: string) => void;
  onBack: () => void;
}

// A purchasable/equippable row: the price → owned → equipped states are the
// same whether it holds an avatar or a background, so both tabs render this.
interface ShopRowProps {
  name: string;
  price: number;
  owned: boolean;
  selected: boolean;
  affordable: boolean;
  thumb: React.ReactNode;
  // Ships only: the special this hull unlocks. Shown before the price, because
  // it — not the paint job — is what the coins are actually buying.
  special?: SpecialDef;
  /** Identity colour — the same hue as this hull's shot and its special. */
  tier?: string;
  onPress: () => void;
}

/**
 * A shop card.
 *
 * This was the same flex row as everything else — right for a settings screen,
 * wrong for the moment a player spends the biggest number they have ever saved.
 *
 * The 2px top edge is in the item's TIER COLOUR, which is the same colour as
 * that hull's shot and its special's effects. The player learns "violet means
 * Raptor" once, and then every violet thing on screen belongs to them.
 *
 * Locked hulls still show the silhouette and the special's name: sell the
 * fantasy, don't hide it behind a padlock.
 */
function ShopRow({ name, price, owned, selected, affordable, thumb, special, tier, onPress }: ShopRowProps) {
  const locked = !owned && !affordable;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.shopItem,
        selected && styles.shopItemSelected,
        pressed && styles.pressed,
      ]}
    >
      {/* The tier edge — the card's one piece of identity colour. */}
      <View style={[styles.shopTierEdge, { backgroundColor: tier ?? PALETTE.edge }]} />
      <View style={styles.shopBody}>
        <View style={[styles.shopThumb, locked && styles.shopThumbLocked]}>{thumb}</View>
        <View style={{ flex: 1 }}>
          <Text style={styles.shopName}>{name}</Text>
          {special && (
            <>
              <Text style={[styles.shopSpecial, tier ? { color: tier } : null]}>{special.name}</Text>
              <Text style={styles.shopSpecialDesc}>{special.desc}</Text>
            </>
          )}
        </View>
        {/* State pill: EQUIPPED is filled, OWNED is an outline, and a price is
            a coin glyph beside a tabular figure. */}
        <View style={styles.shopState}>
          {selected ? (
            <View style={styles.pillFilled}>
              <Text style={styles.pillFilledTxt}>EQUIPPED</Text>
            </View>
          ) : owned ? (
            <View style={styles.pillOutline}>
              <Text style={styles.pillOutlineTxt}>OWNED</Text>
            </View>
          ) : (
            <View style={[styles.pricePill, !affordable && styles.pricePillShort]}>
              <CoinIcon size={11} />
              <Text style={[styles.priceFig, !affordable && styles.priceFigShort]}>{price}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export function ShopScreen({
  save,
  onBuyAvatar,
  onSelectAvatar,
  onBuyBackground,
  onSelectBackground,
  onBack,
}: ShopProps) {
  const [tab, setTab] = useState<ShopTab>('ships');

  return (
    <View style={styles.screen}>
      <Text style={styles.shopTitle}>SHOP</Text>
      <View style={styles.shopWallet}>
        <CoinIcon size={16} />
        <Text style={styles.shopWalletTxt}>{save.likes} coins</Text>
      </View>

      <View style={styles.tabs}>
        <Pressable onPress={() => setTab('ships')} style={[styles.tab, tab === 'ships' && styles.tabActive]}>
          <Text style={[styles.tabTxt, tab === 'ships' && styles.tabTxtActive]}>SHIPS</Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('backgrounds')}
          style={[styles.tab, tab === 'backgrounds' && styles.tabActive]}
        >
          <Text style={[styles.tabTxt, tab === 'backgrounds' && styles.tabTxtActive]}>BACKGROUNDS</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.shopList} contentContainerStyle={{ paddingBottom: 24 }}>
        {tab === 'ships'
          ? AVATARS_BY_PRICE.map((a) => {
              const owned = save.unlocked.includes(a.id);
              const selected = save.selectedAvatar === a.id;
              const affordable = save.likes >= a.price;
              return (
                <ShopRow
                  key={a.id}
                  name={a.name}
                  price={a.price}
                  owned={owned}
                  selected={selected}
                  affordable={affordable}
                  special={SPECIALS[a.special]}
                  tier={a.shot.tint}
                  thumb={
                    <Image source={a.image} style={styles.shopHullImg} resizeMode="contain" />
                  }
                  onPress={() =>
                    owned ? onSelectAvatar(a.id) : affordable ? onBuyAvatar(a.id) : undefined
                  }
                />
              );
            })
          : BACKGROUNDS_BY_PRICE.map((b) => {
              const owned = save.unlockedBackgrounds.includes(b.id);
              const selected = save.selectedBackground === b.id;
              const affordable = save.likes >= b.price;
              return (
                <ShopRow
                  key={b.id}
                  name={b.name}
                  price={b.price}
                  owned={owned}
                  selected={selected}
                  affordable={affordable}
                  thumb={<Image source={b.preview} style={styles.shopBgThumb} resizeMode="cover" />}
                  onPress={() =>
                    owned ? onSelectBackground(b.id) : affordable ? onBuyBackground(b.id) : undefined
                  }
                />
              );
            })}
      </ScrollView>
      <Button label="BACK" icon="back" onPress={onBack} style={styles.wideBtn} />
    </View>
  );
}

const styles = StyleSheet.create({
  wideBtn: { alignSelf: 'stretch', marginTop: 10 },
  screen: {
    flex: 1,
    // Transparent: App mounts the ambient parallax behind every shell, and an
    // opaque background here would cover it.
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 60,
  },
  menuTopBar: {
    position: 'absolute',
    top: 52,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  menuBestLabel: {
    ...TYPE.micro,
    color: PALETTE.inkMute,
  },
  menuWallet: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wordmark: { alignItems: 'center', marginBottom: 6 },
  // The hull on a lit pedestal, with its special named — the menu sells the
  // ship rather than listing buttons above it.
  pedestal: { alignItems: 'center', marginBottom: 18 },
  pedestalGlow: {
    position: 'absolute',
    bottom: 26,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: PALETTE.plasmaGlow,
    opacity: 0.5,
  },
  pedestalShip: {
    ...TYPE.title,
    color: PALETTE.ink,
    marginTop: 6,
  },
  pedestalSpecial: {
    ...TYPE.micro,
    marginTop: 2,
  },
  menuCta: { alignSelf: 'stretch' },
  rail: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
  },
  guideLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
  },
  kicker: {
    color: PALETTE.inkDim,
    fontSize: 12,
    fontFamily: FONTS.display,
    letterSpacing: 5,
    marginBottom: 8,
  },
  title: {
    ...TYPE.displayLItalic,
    color: PALETTE.ink,
    fontSize: 58,
    lineHeight: 60,
  },
  titleAccent: { color: PALETTE.plasma },
  menuAvatarImg: { width: 104, height: 116, marginTop: 20 },
  menuBestDim: {
    color: PALETTE.inkDim,
    fontSize: 12,
    fontFamily: FONTS.display,
    letterSpacing: 1,
  },
  menuBest: {
    color: PALETTE.inkDim,
    fontSize: 14,
    fontFamily: FONTS.data,
    letterSpacing: 2,
  },
  primary: {
    backgroundColor: PALETTE.plasma,
    paddingVertical: 17,
    paddingHorizontal: 46,
    borderRadius: 14,
    marginTop: 6,
  },
  primaryTxt: {
    color: '#04121A',
    fontSize: 17,
    fontFamily: FONTS.display,
    letterSpacing: 2,
  },
  secondary: {
    marginTop: 14,
    paddingVertical: 13,
    paddingHorizontal: 40,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  secondaryTxt: {
    color: PALETTE.ink,
    fontSize: 14,
    fontFamily: FONTS.display,
    letterSpacing: 2,
  },
  pressed: { opacity: 0.75 },
  menuBtnRow: {
    flexDirection: 'row',
    gap: 10,
    alignSelf: 'stretch',
  },
  menuBtnHalf: {
    flex: 1,
    paddingHorizontal: 0,
    alignItems: 'center',
  },
  menuBtnWide: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingHorizontal: 0,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    backgroundColor: PALETTE.threat,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTxt: {
    color: PALETTE.ink,
    fontSize: 11,
    fontFamily: FONTS.data,
  },
  menuLinks: {
    flexDirection: 'row',
    gap: 22,
    marginTop: 16,
  },
  guideLinkTxt: {
    color: PALETTE.gold,
    fontSize: 12,
    fontFamily: FONTS.display,
    letterSpacing: 1.5,
  },
  // --- Pick-up guide overlay ---
  guideOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(6,8,16,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
    paddingVertical: 60,
  },
  guideTitle: {
    color: PALETTE.ink,
    fontSize: 30,
    fontFamily: FONTS.display,
    letterSpacing: 4,
  },
  guideSub: {
    color: PALETTE.inkDim,
    fontSize: 12.5,
    fontFamily: FONTS.display,
    letterSpacing: 1,
    marginTop: 4,
    marginBottom: 18,
  },
  guideList: {
    alignSelf: 'stretch',
    flexGrow: 0,
    flexShrink: 1,
    marginBottom: 18,
  },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.hull,
    borderWidth: 1.5,
    borderColor: PALETTE.edge,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    gap: 14,
  },
  guideIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideIconImg: {
    width: 40,
    height: 40,
  },
  guideIconEmoji: {
    fontSize: 30,
  },
  guideName: {
    color: PALETTE.ink,
    fontSize: 15,
    fontFamily: FONTS.display,
    letterSpacing: 0.5,
  },
  guideDesc: {
    color: PALETTE.inkDim,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 2,
  },
  guideFoot: {
    ...TYPE.body,
    color: PALETTE.inkDim,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 6,
  },
  hint: {
    position: 'absolute',
    bottom: 48,
    color: PALETTE.inkDim,
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 19,
  },
  fried: {
    color: PALETTE.threat,
    fontSize: 24,
    fontFamily: FONTS.display,
    letterSpacing: 4,
    marginBottom: 14,
  },
  distLabel: {
    color: PALETTE.inkDim,
    fontSize: 12,
    fontFamily: FONTS.display,
    letterSpacing: 5,
    marginBottom: 2,
  },
  bigScore: {
    ...TYPE.displayXl,
    color: PALETTE.ink,
    fontSize: 80,
  },
  // No bottom gap on either: the stat row below supplies the spacing.
  newBest: {
    color: PALETTE.gold,
    fontSize: 14,
    fontFamily: FONTS.display,
    letterSpacing: 4,
    marginTop: 8,
  },
  overBest: {
    color: PALETTE.inkDim,
    fontSize: 14,
    fontFamily: FONTS.data,
    letterSpacing: 2,
    marginTop: 10,
  },
  menuStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    marginBottom: 26,
  },
  menuCoins: {
    color: COIN_GOLD,
    fontSize: 14,
    fontFamily: FONTS.data,
    letterSpacing: 1,
  },
  shopWallet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
    marginBottom: 26,
  },
  shopWalletTxt: {
    color: COIN_GOLD,
    fontSize: 14,
    fontFamily: FONTS.data,
    letterSpacing: 1.5,
  },
  shopPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  breakdown: {
    alignSelf: 'stretch',
    backgroundColor: PALETTE.hull,
    borderWidth: 1.5,
    borderColor: PALETTE.edge,
    borderRadius: 14,
    padding: 12,
    marginTop: 16,
  },
  breakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  breakLabel: { color: PALETTE.inkDim, fontSize: 12.5 },
  breakValue: { color: PALETTE.ink, fontSize: 12.5, fontWeight: '800' },
  overWave: {
    color: PALETTE.gold,
    fontSize: 13,
    fontFamily: FONTS.display,
    letterSpacing: 2,
    marginTop: 8,
  },
  coinEarned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 22,
    marginBottom: 26,
  },
  deepEarned: {
    flexDirection: 'row',
    gap: 16,
    marginTop: -14,
    marginBottom: 22,
  },
  deepEarnItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  deepEarnedTxt: {
    color: PALETTE.ink,
    fontSize: 13,
    fontFamily: FONTS.display,
    letterSpacing: 1,
  },
  coinEarnedTxt: {
    color: COIN_GOLD,
    fontSize: 15,
    fontFamily: FONTS.data,
    letterSpacing: 1.5,
  },
  linkBtn: { marginTop: 20 },
  linkTxt: { color: PALETTE.inkDim, fontSize: 14, fontWeight: '600' },
  shopTitle: {
    color: PALETTE.ink,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 4,
  },
  tabs: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: 8,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: PALETTE.edge,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: PALETTE.hull,
    borderColor: PALETTE.plasma,
  },
  tabTxt: {
    color: PALETTE.inkDim,
    fontSize: 12.5,
    fontFamily: FONTS.display,
    letterSpacing: 1.5,
  },
  tabTxtActive: { color: PALETTE.ink },
  shopBgThumb: {
    width: 62,
    height: 46,
    borderRadius: 8,
    backgroundColor: PALETTE.void,
  },
  shopList: { alignSelf: 'stretch', marginTop: 8 },
  shopTierEdge: { height: 2, width: '100%' },
  shopBody: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    gap: 12,
  },
  shopThumb: { width: 52, alignItems: 'center' },
  // A locked hull is dimmed, never hidden — the silhouette and the special are
  // exactly what is being sold.
  shopThumbLocked: { opacity: 0.55 },
  shopHullImg: { width: 50, height: 60 },
  shopState: { alignItems: 'flex-end', minWidth: 74 },
  pillFilled: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: PALETTE.plasma,
  },
  pillFilledTxt: { ...TYPE.micro, color: '#04121A' },
  pillOutline: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PALETTE.edge,
  },
  pillOutlineTxt: { ...TYPE.micro, color: PALETTE.inkDim },
  pricePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PALETTE.edge,
  },
  pricePillShort: { opacity: 0.6 },
  priceFig: { fontFamily: FONTS.data, fontSize: 12, color: PALETTE.gold },
  priceFigShort: { color: PALETTE.inkMute },
  shopItem: {
    backgroundColor: PALETTE.hull,
    borderWidth: 1,
    borderColor: PALETTE.edge,
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  shopItemSelected: { borderColor: PALETTE.plasma },
  shopEmojiImg: { width: 46, height: 50 },
  shopName: { color: PALETTE.ink, fontSize: 16, fontWeight: '800' },
  shopSpecial: {
    color: PALETTE.plasma,
    fontSize: 11,
    fontFamily: FONTS.display,
    letterSpacing: 1,
    marginTop: 3,
  },
  shopSpecialDesc: {
    color: PALETTE.inkDim,
    fontSize: 11.5,
    lineHeight: 15,
    marginTop: 1,
  },
  shopPrice: { color: PALETTE.inkDim, fontSize: 12.5, fontWeight: '700', marginTop: 2 },
  locked: { fontSize: 18 },
});
