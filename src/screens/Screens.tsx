import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, Pressable, ScrollView } from 'react-native';
import { PALETTE, AVATARS, BACKGROUNDS, COIN_GOLD } from '../game/constants';
import { SaveData } from '../game/storage';
import { RunResult } from '../game/types';
import CoinIcon from '../components/Coin';

// Shop catalogs are shown cheapest-first, so the price climbs as the player
// scrolls down. Sorted once at module load (both source lists are static).
const AVATARS_BY_PRICE = [...AVATARS].sort((a, b) => a.price - b.price);
const BACKGROUNDS_BY_PRICE = [...BACKGROUNDS].sort((a, b) => a.price - b.price);

// ---------- Menu ----------
interface MenuProps {
  save: SaveData;
  onStart: () => void;
  onShop: () => void;
}

export function MenuScreen({ save, onStart, onShop }: MenuProps) {
  const avatar = AVATARS.find((a) => a.id === save.selectedAvatar) ?? AVATARS[0];
  return (
    <View style={styles.screen}>
      <Text style={styles.kicker}>HOW HIGH CAN YOU FLY</Text>
      <Text style={styles.title}>INTO THE</Text>
      <Text style={[styles.title, styles.titleAccent]}>SPACE</Text>

      {avatar.image ? (
        <Image source={avatar.image} style={styles.menuAvatarImg} resizeMode="contain" />
      ) : (
        <Text style={styles.menuAvatar}>{avatar.emoji}</Text>
      )}
      <View style={styles.menuStats}>
        {save.best > 0 && <Text style={styles.menuBest}>BEST {save.best}m   ·   </Text>}
        <CoinIcon size={13} />
        <Text style={styles.menuCoins}>{save.likes}</Text>
      </View>

      <Pressable onPress={onStart} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
        <Text style={styles.primaryTxt}>LIFT OFF 🚀</Text>
      </Pressable>
      <Pressable onPress={onShop} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
        <Text style={styles.secondaryTxt}>SHOP</Text>
      </Pressable>

      <Text style={styles.hint}>
        Drag your ship — it fires on its own.{'\n'}
        Blast the alien waves, grab ❤️ hearts to stay alive,{'\n'}
        scoop up gold coins and gun upgrades.{'\n'}
        How high can you fly?
      </Text>
    </View>
  );
}

// ---------- Game Over ----------
interface OverProps {
  result: RunResult;
  best: number;
  isNewBest: boolean;
  onRestart: () => void;
  onMenu: () => void;
}

export function GameOverScreen({ result, best, isNewBest, onRestart, onMenu }: OverProps) {
  return (
    <View style={styles.screen}>
      <Text style={styles.fried}>💥 ROCKET DOWN</Text>
      <Text style={styles.distLabel}>DISTANCE</Text>
      <Text style={styles.bigScore}>{result.altitude}m</Text>
      {isNewBest ? (
        <Text style={styles.newBest}>NEW BEST</Text>
      ) : (
        <Text style={styles.overBest}>BEST {best}m</Text>
      )}

      {/* Distance is the score; coins are what the run actually banked. */}
      <View style={styles.coinEarned}>
        <CoinIcon size={20} />
        <Text style={styles.coinEarnedTxt}>+{result.coins} COLLECTED</Text>
      </View>

      <Pressable onPress={onRestart} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
        <Text style={styles.primaryTxt}>LAUNCH AGAIN</Text>
      </Pressable>
      <Pressable onPress={onMenu} hitSlop={12} style={styles.linkBtn}>
        <Text style={styles.linkTxt}>Back to menu</Text>
      </Pressable>
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
  onPress: () => void;
}

function ShopRow({ name, price, owned, selected, affordable, thumb, onPress }: ShopRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.shopItem, selected && styles.shopItemSelected, pressed && styles.pressed]}
    >
      {thumb}
      <View style={{ flex: 1 }}>
        <Text style={styles.shopName}>{name}</Text>
        {selected || owned ? (
          <Text style={styles.shopPrice}>{selected ? 'EQUIPPED' : 'Tap to equip'}</Text>
        ) : (
          <View style={styles.shopPriceRow}>
            <CoinIcon size={11} />
            <Text style={[styles.shopPrice, { color: COIN_GOLD, marginTop: 0 }]}>{price}</Text>
          </View>
        )}
      </View>
      {!owned && !affordable && <Text style={styles.locked}>🔒</Text>}
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
                  thumb={
                    a.image ? (
                      <Image source={a.image} style={styles.shopEmojiImg} resizeMode="contain" />
                    ) : (
                      <Text style={styles.shopEmoji}>{a.emoji}</Text>
                    )
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
      <Pressable onPress={onBack} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
        <Text style={styles.secondaryTxt}>BACK</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PALETTE.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 60,
  },
  kicker: {
    color: PALETTE.textDim,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 5,
    marginBottom: 8,
  },
  title: {
    color: PALETTE.text,
    fontSize: 58,
    fontWeight: '900',
    fontStyle: 'italic',
    lineHeight: 60,
    letterSpacing: 2,
  },
  titleAccent: { color: PALETTE.rage },
  menuAvatar: { fontSize: 52, marginTop: 20 },
  menuAvatarImg: { width: 104, height: 116, marginTop: 20 },
  menuBest: {
    color: PALETTE.textDim,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
  },
  primary: {
    backgroundColor: PALETTE.moment,
    paddingVertical: 17,
    paddingHorizontal: 46,
    borderRadius: 14,
    marginTop: 6,
  },
  primaryTxt: {
    color: '#0B0D10',
    fontSize: 17,
    fontWeight: '900',
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
    color: PALETTE.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
  },
  pressed: { opacity: 0.75 },
  hint: {
    position: 'absolute',
    bottom: 48,
    color: PALETTE.textDim,
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 19,
  },
  fried: {
    color: PALETTE.rage,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: 14,
  },
  distLabel: {
    color: PALETTE.textDim,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 5,
    marginBottom: 2,
  },
  bigScore: {
    color: PALETTE.text,
    fontSize: 80,
    fontWeight: '900',
    fontStyle: 'italic',
  },
  // No bottom gap on either: the stat row below supplies the spacing.
  newBest: {
    color: PALETTE.moment,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 4,
    marginTop: 8,
  },
  overBest: {
    color: PALETTE.textDim,
    fontSize: 14,
    fontWeight: '700',
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
    fontWeight: '800',
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
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  shopPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  coinEarned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 22,
    marginBottom: 26,
  },
  coinEarnedTxt: {
    color: COIN_GOLD,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  linkBtn: { marginTop: 20 },
  linkTxt: { color: PALETTE.textDim, fontSize: 14, fontWeight: '600' },
  shopTitle: {
    color: PALETTE.text,
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
    borderColor: PALETTE.cardBorder,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: PALETTE.card,
    borderColor: PALETTE.moment,
  },
  tabTxt: {
    color: PALETTE.textDim,
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  tabTxtActive: { color: PALETTE.text },
  shopBgThumb: {
    width: 62,
    height: 46,
    borderRadius: 8,
    backgroundColor: '#04060E',
  },
  shopList: { alignSelf: 'stretch', marginTop: 8 },
  shopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.card,
    borderWidth: 1.5,
    borderColor: PALETTE.cardBorder,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  shopItemSelected: { borderColor: PALETTE.moment },
  shopEmoji: { fontSize: 34 },
  shopEmojiImg: { width: 46, height: 50 },
  shopName: { color: PALETTE.text, fontSize: 16, fontWeight: '800' },
  shopPrice: { color: PALETTE.textDim, fontSize: 12.5, fontWeight: '700', marginTop: 2 },
  locked: { fontSize: 18 },
});
