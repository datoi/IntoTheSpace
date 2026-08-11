// Progression screens: the Hangar (permanent ship upgrades) and Statistics.
//
// Both are pure views over SaveData — they compute nothing that isn't derived
// from the save and the upgrade catalog, and every purchase goes back through
// App's `onBuyUpgrade` so the cost is re-validated against the real wallet
// rather than whatever this screen last rendered.

import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, Pressable, ScrollView } from 'react-native';
import { PALETTE, AVATARS, COIN_GOLD } from '../game/constants';
import { SaveData, balanceOf } from '../game/storage';
import {
  CURRENCY_DEFS,
  Currency,
  Price,
  Stats,
  UpgradeKind,
  canAfford,
  levelOf,
  priceParts,
} from '../game/progression';
import {
  ShipStats,
  UPGRADE_ORDER,
  UPGRADE_TRACKS,
  maxLevelOf,
  resolveShipStats,
  upgradeCost,
} from '../game/upgrades';
import { FONTS } from '../game/type';
import CoinIcon from '../components/Coin';
import { Button } from '../components/Button';
import Icon from '../components/Icon';

// ---------- Shared bits ----------

/** The wallet strip both screens show at the top. */
function WalletRow({ save }: { save: SaveData }) {
  const bal = balanceOf(save);
  // Coins always show; the deep currencies appear once the player has any, so a
  // new player isn't confronted with three zeroed resources they've never seen.
  const deep: Currency[] = (['crystals', 'chips', 'alloy'] as Currency[]).filter((c) => bal[c] > 0);
  return (
    <View style={styles.wallet}>
      <View style={styles.walletItem}>
        <CoinIcon size={14} />
        <Text style={styles.walletTxt}>{bal.coins}</Text>
      </View>
      {deep.map((c) => (
        <View key={c} style={styles.walletItem}>
          <Icon name={CURRENCY_DEFS[c].icon} size={13} color={PALETTE.gold} />
          <Text style={styles.walletTxt}>{bal[c]}</Text>
        </View>
      ))}
    </View>
  );
}

/** A price rendered across however many currencies it spans. */
function PriceTag({ price, affordable }: { price: Price; affordable: boolean }) {
  const parts = priceParts(price);
  return (
    <View style={styles.priceRow}>
      {parts.map(({ currency, amount }) => (
        <View key={currency} style={styles.priceItem}>
          {currency === 'coins' ? (
            <CoinIcon size={11} />
          ) : (
            <Icon name={CURRENCY_DEFS[currency].icon} size={11} color={PALETTE.gold} />
          )}
          <Text style={[styles.priceTxt, !affordable && styles.priceTxtShort]}>{amount}</Text>
        </View>
      ))}
    </View>
  );
}

/** Level pips — a filled run of blocks, so progress reads without arithmetic. */
function LevelPips({ level, max }: { level: number; max: number }) {
  return (
    <View style={styles.pips}>
      {Array.from({ length: max }, (_, i) => (
        <View key={i} style={[styles.pip, i < level && styles.pipFilled]} />
      ))}
    </View>
  );
}

// ---------- Hangar (upgrades) ----------

interface HangarProps {
  save: SaveData;
  /** Resolved stats for the equipped hull, shown as the summary block. */
  shipStats: ShipStats;
  onBuyUpgrade: (kind: UpgradeKind) => void;
  onSelectAvatar: (id: string) => void;
  onBack: () => void;
}

export function HangarScreen({ save, shipStats, onBuyUpgrade, onSelectAvatar, onBack }: HangarProps) {
  // Upgrades are per-hull, so the screen needs a hull picker: the row of owned
  // ships doubles as "which one am I investing in".
  const owned = AVATARS.filter((a) => save.unlocked.includes(a.id));
  const [viewing, setViewing] = useState(save.selectedAvatar);
  const ship = AVATARS.find((a) => a.id === viewing) ?? AVATARS[0];
  const isEquipped = save.selectedAvatar === ship.id;
  // The equipped hull's stats come in as a prop (App already computed them);
  // any OTHER hull the player is browsing is resolved here.
  const stats = isEquipped ? shipStats : resolveShipStats(save.upgrades, ship.id);
  const bal = balanceOf(save);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>HANGAR</Text>
      <WalletRow save={save} />

      {/* Hull picker */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.shipStrip}>
        {owned.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => setViewing(a.id)}
            style={({ pressed }) => [
              styles.shipChip,
              viewing === a.id && styles.shipChipActive,
              pressed && styles.pressed,
            ]}
          >
            <Image source={a.image} style={styles.shipChipImg} resizeMode="contain" />
            <Text style={[styles.shipChipTxt, viewing === a.id && styles.shipChipTxtActive]}>
              {a.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Summary for the hull being viewed */}
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>
          {ship.name}
          {stats.tier > 0 ? ` · TIER ${stats.tier}` : ''}
        </Text>
        <Text style={styles.summaryLine}>
          {stats.investment} level{stats.investment === 1 ? '' : 's'} invested ·{' '}
          {stats.startHearts} starting hull · {stats.bombCapacity} bombs
        </Text>
        <Text style={styles.summaryLine}>
          ×{stats.dmgMult.toFixed(2)} damage · {stats.critChance > 0
            ? `${Math.round(stats.critChance * 100)}% crit ×${stats.critMult.toFixed(2)}`
            : 'no crit yet'}
        </Text>
        {!isEquipped && (
          <Pressable
            onPress={() => onSelectAvatar(ship.id)}
            style={({ pressed }) => [styles.equipBtn, pressed && styles.pressed]}
          >
            <Text style={styles.equipTxt}>EQUIP THIS HULL</Text>
          </Pressable>
        )}
      </View>

      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 20 }}>
        {UPGRADE_ORDER.map((kind) => {
          const def = UPGRADE_TRACKS[kind];
          const level = levelOf(save.upgrades, ship.id, kind);
          const max = maxLevelOf(kind);
          const maxed = level >= max;
          const price = upgradeCost(kind, level);
          const affordable = !maxed && canAfford(bal, price);
          return (
            <Pressable
              key={kind}
              // Only the equipped hull can be upgraded: App spends against
              // `selectedAvatar`, so allowing it here would silently invest in
              // the wrong ship.
              disabled={maxed || !affordable || !isEquipped}
              onPress={() => onBuyUpgrade(kind)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Icon name={def.icon} size={22} color={PALETTE.plasma} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>
                  {def.name}
                  <Text style={styles.rowLevel}>
                    {'  '}
                    {level}/{max}
                  </Text>
                </Text>
                <Text style={styles.rowDesc}>{def.desc}</Text>
                <LevelPips level={level} max={max} />
                <Text style={styles.rowPerLevel}>{def.perLevelLabel} per level</Text>
              </View>
              <View style={styles.rowRight}>
                {maxed ? (
                  <Text style={styles.maxed}>MAX</Text>
                ) : (
                  <>
                    <PriceTag price={price} affordable={affordable} />
                    <Text style={[styles.buyHint, affordable && isEquipped && styles.buyHintOn]}>
                      {!isEquipped ? 'not equipped' : affordable ? 'TAP TO BUY' : 'need more'}
                    </Text>
                  </>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <Button label="BACK" icon="back" onPress={onBack} style={styles.wideBtn} />
    </View>
  );
}

// ---------- Statistics ----------

interface StatRow {
  label: string;
  value: string;
}

/** Seconds → a compact "3h 12m" / "12m 04s". */
function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

const groupsOf = (stats: Stats, best: number): { title: string; rows: StatRow[] }[] => {
  // Accuracy is derived rather than stored: two counters can't disagree with
  // each other the way a third cached one could.
  const accuracy = stats.shotsFired > 0 ? (stats.shotsHit / stats.shotsFired) * 100 : 0;
  return [
    {
      title: 'RUNS',
      rows: [
        { label: 'Games played', value: `${stats.runs}` },
        { label: 'Time played', value: formatTime(stats.timePlayed) },
        { label: 'Best altitude', value: `${best}m` },
        { label: 'Total distance', value: `${stats.totalAltitude}m` },
        { label: 'Highest wave', value: `${stats.highestWave}` },
        { label: 'Flawless waves', value: `${stats.flawlessWaves}` },
      ],
    },
    {
      title: 'COMBAT',
      rows: [
        { label: 'Enemies destroyed', value: `${stats.kills}` },
        { label: 'Elites destroyed', value: `${stats.eliteKills}` },
        { label: 'Mini bosses', value: `${stats.miniBossKills}` },
        { label: 'Giant bosses', value: `${stats.giantBossKills}` },
        { label: 'Perfect boss kills', value: `${stats.perfectBosses}` },
        { label: 'Damage dealt', value: `${stats.damageDealt}` },
        { label: 'Shots fired', value: `${stats.shotsFired}` },
        { label: 'Accuracy', value: `${accuracy.toFixed(1)}%` },
      ],
    },
    {
      title: 'HAUL',
      rows: [
        { label: 'Coins collected', value: `${stats.coinsCollected}` },
        { label: 'Crystals collected', value: `${stats.crystalsCollected}` },
        { label: 'Pickups grabbed', value: `${stats.pickupsCollected}` },
        { label: 'Hearts collected', value: `${stats.heartsCollected}` },
        { label: 'Bombs detonated', value: `${stats.bombsUsed}` },
        { label: 'Specials fired', value: `${stats.specialsUsed}` },
        { label: 'Upgrades bought', value: `${stats.upgradesBought}` },
      ],
    },
  ];
};

export function StatsScreen({ save, onBack }: { save: SaveData; onBack: () => void }) {
  const groups = groupsOf(save.stats, save.best);
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>STATISTICS</Text>
      <WalletRow save={save} />
      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 20 }}>
        {groups.map((gr) => (
          <View key={gr.title} style={styles.statGroup}>
            <Text style={styles.statGroupTitle}>{gr.title}</Text>
            {gr.rows.map((r) => (
              <View key={r.label} style={styles.statRow}>
                <Text style={styles.statLabel}>{r.label}</Text>
                <Text style={styles.statValue}>{r.value}</Text>
              </View>
            ))}
          </View>
        ))}
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
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 28,
  },
  title: {
    color: PALETTE.ink,
    fontSize: 28,
    fontFamily: FONTS.display,
    letterSpacing: 4,
  },
  pressed: { opacity: 0.72 },
  secondary: {
    marginTop: 12,
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
  // --- Wallet ---
  wallet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 10,
    marginBottom: 12,
  },
  walletItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  walletTxt: {
    color: COIN_GOLD,
    fontSize: 13,
    fontFamily: FONTS.display,
    letterSpacing: 0.8,
  },
  // --- Hull picker ---
  shipStrip: { alignSelf: 'stretch', flexGrow: 0, marginBottom: 10 },
  shipChip: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: PALETTE.edge,
    backgroundColor: PALETTE.hull,
  },
  shipChipActive: { borderColor: PALETTE.plasma },
  shipChipImg: { width: 34, height: 38 },
  shipChipTxt: {
    color: PALETTE.inkDim,
    fontSize: 10.5,
    fontFamily: FONTS.display,
    letterSpacing: 0.5,
    marginTop: 3,
  },
  shipChipTxtActive: { color: PALETTE.ink },
  // --- Summary ---
  summary: {
    alignSelf: 'stretch',
    backgroundColor: PALETTE.hull,
    borderWidth: 1.5,
    borderColor: PALETTE.edge,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  summaryTitle: {
    color: PALETTE.ink,
    fontSize: 15,
    fontFamily: FONTS.display,
    letterSpacing: 1,
  },
  summaryLine: {
    color: PALETTE.inkDim,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 2,
  },
  equipBtn: {
    marginTop: 9,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: PALETTE.plasma,
    alignItems: 'center',
  },
  equipTxt: {
    color: PALETTE.plasma,
    fontSize: 11.5,
    fontFamily: FONTS.display,
    letterSpacing: 1.5,
  },
  // --- Upgrade rows ---
  list: { alignSelf: 'stretch', flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.hull,
    borderWidth: 1.5,
    borderColor: PALETTE.edge,
    borderRadius: 14,
    padding: 12,
    marginBottom: 9,
    gap: 11,
  },
  rowName: { color: PALETTE.ink, fontSize: 14.5, fontWeight: '800' },
  rowLevel: { color: PALETTE.inkDim, fontSize: 12, fontWeight: '700' },
  rowDesc: { color: PALETTE.inkDim, fontSize: 11.5, lineHeight: 15, marginTop: 1 },
  rowPerLevel: {
    color: PALETTE.plasma,
    fontSize: 10.5,
    fontFamily: FONTS.display,
    letterSpacing: 0.3,
    marginTop: 3,
  },
  rowRight: { alignItems: 'flex-end', minWidth: 74 },
  pips: { flexDirection: 'row', gap: 3, marginTop: 5 },
  pip: {
    width: 11,
    height: 5,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  pipFilled: { backgroundColor: PALETTE.plasma },
  priceRow: { alignItems: 'flex-end', gap: 2 },
  priceItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceTxt: { color: COIN_GOLD, fontSize: 12, fontWeight: '900' },
  priceTxtShort: { color: PALETTE.inkDim },
  buyHint: {
    color: PALETTE.inkDim,
    fontSize: 9,
    fontFamily: FONTS.display,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  buyHintOn: { color: PALETTE.plasma },
  maxed: {
    color: PALETTE.gold,
    fontSize: 12,
    fontFamily: FONTS.display,
    letterSpacing: 1.5,
  },
  // --- Statistics ---
  statGroup: {
    backgroundColor: PALETTE.hull,
    borderWidth: 1.5,
    borderColor: PALETTE.edge,
    borderRadius: 14,
    padding: 13,
    marginBottom: 10,
  },
  statGroupTitle: {
    color: PALETTE.plasma,
    fontSize: 11,
    fontFamily: FONTS.display,
    letterSpacing: 2.5,
    marginBottom: 7,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3.5,
  },
  statLabel: { color: PALETTE.inkDim, fontSize: 12.5, flex: 1 },
  statValue: { color: PALETTE.ink, fontSize: 12.5, fontWeight: '800' },
});
