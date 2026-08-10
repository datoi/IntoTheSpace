// The Quests screen: missions, achievements, milestones, daily/weekly
// challenges and the login calendar.
//
// A pure view over SaveData. Nothing here decides whether a reward is owed —
// every claim goes back through App, which re-validates against the engine, so
// this screen can never pay anything out on its own.

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { PALETTE, COIN_GOLD } from '../game/constants';
import { SaveData } from '../game/storage';
import { CURRENCY_DEFS, Currency, Price, priceParts } from '../game/progression';
import {
  ACHIEVEMENTS,
  LOGIN_CYCLE,
  MILESTONES,
  MISSIONS,
  Quest,
  Reward,
  activeMissions,
  canClaimLogin,
  liveDailyChallenges,
  isComplete,
  loginReward,
  missionsCompleted,
  nextLoginDay,
  progressOf,
  liveWeeklyChallenges,
} from '../game/missions';
import { FONTS } from '../game/type';
import CoinIcon from '../components/Coin';
import { Button } from '../components/Button';
import Icon from '../components/Icon';

type Tab = 'missions' | 'daily' | 'achievements' | 'milestones';

interface Props {
  save: SaveData;
  /** Injected so the screen is deterministic under test. */
  now?: number;
  onClaim: (quest: Quest, bucket: 'main' | 'daily' | 'weekly') => void;
  onClaimLogin: () => void;
  onBack: () => void;
}

// ---------- Shared pieces ----------

function RewardTag({ reward }: { reward: Reward }) {
  const parts: { currency: Currency; amount: number }[] = reward.currencies
    ? priceParts(reward.currencies as Price)
    : [];
  return (
    <View style={styles.rewardRow}>
      {parts.map(({ currency, amount }) => (
        <View key={currency} style={styles.rewardItem}>
          {currency === 'coins' ? (
            <CoinIcon size={11} />
          ) : (
            <Icon name={CURRENCY_DEFS[currency].icon} size={10} color={PALETTE.gold} />
          )}
          <Text style={styles.rewardTxt}>{amount}</Text>
        </View>
      ))}
      {reward.ship && <Text style={styles.rewardTxt}>SHIP</Text>}
      {reward.background && <Text style={styles.rewardTxt}>BACKDROP</Text>}
    </View>
  );
}

interface QuestRowProps {
  quest: Quest;
  save: SaveData;
  runBests: Record<string, number>;
  claimed: boolean;
  onClaim: () => void;
}

function QuestRow({ quest, save, runBests, claimed, onClaim }: QuestRowProps) {
  const done = isComplete(quest.objective, save.stats, runBests, quest.id);
  const current = progressOf(quest.objective, save.stats, runBests, quest.id);
  const target = quest.objective.target;
  const frac = target > 0 ? Math.min(1, current / target) : 1;
  const claimable = done && !claimed;

  return (
    <Pressable
      disabled={!claimable}
      onPress={onClaim}
      style={({ pressed }) => [
        styles.row,
        claimable && styles.rowClaimable,
        claimed && styles.rowClaimed,
        pressed && styles.pressed,
      ]}
    >
      <Icon name={quest.icon} size={21} color={claimed ? PALETTE.inkMute : PALETTE.gold} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowName, claimed && styles.dimmed]}>{quest.name}</Text>
        <Text style={styles.rowDesc}>{quest.desc}</Text>
        {/* Progress bar: the number alone doesn't read at a glance, and the bar
            alone hides how far the target is. Both, always. */}
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${frac * 100}%` }, done && styles.barFillDone]} />
        </View>
        <Text style={styles.rowProgress}>
          {formatCount(current, quest.objective.metric)} / {formatCount(target, quest.objective.metric)}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <RewardTag reward={quest.reward} />
        {claimed ? (
          <Text style={styles.claimedTxt}>CLAIMED</Text>
        ) : claimable ? (
          <Text style={styles.claimTxt}>TAP TO CLAIM</Text>
        ) : (
          <Text style={styles.lockedTxt}>{Math.floor(frac * 100)}%</Text>
        )}
      </View>
    </Pressable>
  );
}

/** Seconds read as mm:ss; everything else is a plain count. */
function formatCount(n: number, metric: string): string {
  if (metric === 'timePlayed') {
    const s = Math.floor(n);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  return n >= 10000 ? `${Math.round(n / 1000)}k` : String(Math.floor(n));
}

// ---------- Login calendar ----------

function LoginCalendar({
  save,
  now,
  onClaimLogin,
}: {
  save: SaveData;
  now: number;
  onClaimLogin: () => void;
}) {
  const { login } = save.quests;
  const available = canClaimLogin(login, now);
  const highlight = nextLoginDay(login, now);
  // A window around the current day rather than all 30 — a 30-cell grid on a
  // phone is unreadable, and the days that matter are the ones nearby.
  const start = Math.max(1, Math.min(highlight - 2, LOGIN_CYCLE - 6));
  const days = Array.from({ length: 7 }, (_, i) => start + i).filter((d) => d <= LOGIN_CYCLE);

  return (
    <View style={styles.loginBox}>
      <Text style={styles.loginTitle}>DAILY REWARD</Text>
      <Text style={styles.loginSub}>
        {login.streak > 0 ? `${login.streak}-day streak` : 'Start your streak'} · day {highlight} of{' '}
        {LOGIN_CYCLE}
      </Text>
      <View style={styles.loginGrid}>
        {days.map((d) => {
          const isToday = available && d === highlight;
          // `highlight` is the day a claim right now would land on. If today is
          // still claimable that day is pending, so only earlier days are
          // collected; if it's already claimed, it is collected too.
          const collected = available ? d < highlight : d <= highlight;
          const reward = loginReward(d);
          const coins = reward.currencies?.coins ?? 0;
          return (
            <View
              key={d}
              style={[styles.loginCell, collected && styles.loginCellPast, isToday && styles.loginCellToday]}
            >
              <Text style={[styles.loginDay, isToday && styles.loginDayToday]}>D{d}</Text>
              <Text style={styles.loginAmt}>{coins}</Text>
              {/* Milestone days pay deep currency too — flagged so the streak
                  has a visible target worth keeping. */}
              {d % 7 === 0 && (
                <Icon
                  name={d % 30 === 0 ? 'alloy' : d % 14 === 0 ? 'crystal' : 'chip'}
                  size={8}
                  color={PALETTE.goldHi}
                />
              )}
            </View>
          );
        })}
      </View>
      <Pressable
        disabled={!available}
        onPress={onClaimLogin}
        style={({ pressed }) => [
          styles.loginBtn,
          !available && styles.loginBtnDone,
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.loginBtnTxt, !available && styles.loginBtnTxtDone]}>
          {available ? `CLAIM DAY ${highlight}` : 'COME BACK TOMORROW'}
        </Text>
      </Pressable>
    </View>
  );
}

// ---------- Screen ----------

export function QuestsScreen({ save, now = Date.now(), onClaim, onClaimLogin, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('missions');
  const { quests } = save;

  // Derived from the period's stored key, not from `now` — see
  // liveDailyChallenges. The two diverge if a device clock is wound back, and
  // the list on screen must match the one `claimed` refers to.
  const daily = liveDailyChallenges(quests, now);
  const weekly = liveWeeklyChallenges(quests, now, save.stats);
  const missions = activeMissions(quests);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'missions', label: 'MISSIONS' },
    { id: 'daily', label: 'DAILY' },
    { id: 'achievements', label: 'AWARDS' },
    { id: 'milestones', label: 'MILES' },
  ];

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>OBJECTIVES</Text>

      <View style={styles.tabs}>
        {tabs.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setTab(t.id)}
            style={[styles.tab, tab === t.id && styles.tabActive]}
          >
            <Text style={[styles.tabTxt, tab === t.id && styles.tabTxtActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 20 }}>
        {tab === 'missions' && (
          <>
            <Text style={styles.sectionNote}>
              Campaign · {missionsCompleted(quests)} of {MISSIONS.length} complete
            </Text>
            {missions.map((q) => (
              <QuestRow
                key={q.id}
                quest={q}
                save={save}
                runBests={quests.runBests}
                claimed={quests.claimed.includes(q.id)}
                onClaim={() => onClaim(q, 'main')}
              />
            ))}
          </>
        )}

        {tab === 'daily' && (
          <>
            <LoginCalendar save={save} now={now} onClaimLogin={onClaimLogin} />
            <Text style={styles.sectionNote}>TODAY'S CHALLENGES · reset at midnight</Text>
            {daily.map((q) => (
              <QuestRow
                key={q.id}
                quest={q}
                save={save}
                runBests={quests.daily.runBests}
                claimed={quests.daily.claimed.includes(q.id)}
                onClaim={() => onClaim(q, 'daily')}
              />
            ))}
            <Text style={styles.sectionNote}>THIS WEEK · harder, better paid</Text>
            {weekly.map((q) => (
              <QuestRow
                key={q.id}
                quest={q}
                save={save}
                runBests={quests.weekly.runBests}
                claimed={quests.weekly.claimed.includes(q.id)}
                onClaim={() => onClaim(q, 'weekly')}
              />
            ))}
          </>
        )}

        {tab === 'achievements' && (
          <>
            <Text style={styles.sectionNote}>
              {ACHIEVEMENTS.filter((a) => quests.claimed.includes(a.id)).length} of {ACHIEVEMENTS.length}{' '}
              collected
            </Text>
            {ACHIEVEMENTS.map((q) => (
              <QuestRow
                key={q.id}
                quest={q}
                save={save}
                runBests={quests.runBests}
                claimed={quests.claimed.includes(q.id)}
                onClaim={() => onClaim(q, 'main')}
              />
            ))}
          </>
        )}

        {tab === 'milestones' && (
          <>
            <Text style={styles.sectionNote}>Endless progression rewards</Text>
            {MILESTONES.map((q) => (
              <QuestRow
                key={q.id}
                quest={q}
                save={save}
                runBests={quests.runBests}
                claimed={quests.claimed.includes(q.id)}
                onClaim={() => onClaim(q, 'main')}
              />
            ))}
          </>
        )}
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
    paddingHorizontal: 18,
    paddingTop: 56,
    paddingBottom: 26,
  },
  title: {
    color: PALETTE.ink,
    fontSize: 26,
    fontFamily: FONTS.display,
    letterSpacing: 4,
    marginBottom: 12,
  },
  pressed: { opacity: 0.72 },
  secondary: {
    marginTop: 10,
    paddingVertical: 13,
    paddingHorizontal: 40,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  secondaryTxt: { color: PALETTE.ink, fontSize: 14,
    fontFamily: FONTS.display, fontWeight: '800', letterSpacing: 2 },
  tabs: { flexDirection: 'row', alignSelf: 'stretch', gap: 6, marginBottom: 8 },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: PALETTE.edge,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: PALETTE.hull, borderColor: PALETTE.plasma },
  tabTxt: { color: PALETTE.inkDim, fontSize: 10.5, fontWeight: '900', letterSpacing: 1 },
  tabTxtActive: { color: PALETTE.ink },
  list: { alignSelf: 'stretch', flex: 1 },
  sectionNote: {
    color: PALETTE.inkDim,
    fontSize: 10.5,
    fontFamily: FONTS.display,
    letterSpacing: 1.4,
    marginTop: 10,
    marginBottom: 7,
  },
  // --- Quest row ---
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.hull,
    borderWidth: 1.5,
    borderColor: PALETTE.edge,
    borderRadius: 13,
    padding: 11,
    marginBottom: 8,
    gap: 10,
  },
  rowClaimable: { borderColor: PALETTE.gold, backgroundColor: 'rgba(255,201,60,0.10)' },
  rowClaimed: { opacity: 0.55 },
  dimmed: { color: PALETTE.inkDim },
  rowName: { color: PALETTE.ink, fontSize: 13.5, fontWeight: '800' },
  rowDesc: { color: PALETTE.inkDim, fontSize: 11, lineHeight: 14.5, marginTop: 1 },
  rowProgress: { color: PALETTE.inkDim, fontSize: 10, fontWeight: '700', marginTop: 2 },
  barTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    marginTop: 5,
  },
  barFill: { height: '100%', borderRadius: 2, backgroundColor: PALETTE.gold },
  barFillDone: { backgroundColor: PALETTE.gold },
  rowRight: { alignItems: 'flex-end', minWidth: 70 },
  rewardRow: { alignItems: 'flex-end', gap: 2 },
  rewardItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rewardTxt: { color: COIN_GOLD, fontSize: 11, fontWeight: '900' },
  claimTxt: {
    color: PALETTE.gold,
    fontSize: 8.5,
    fontFamily: FONTS.display,
    letterSpacing: 0.4,
    marginTop: 4,
  },
  claimedTxt: {
    color: PALETTE.inkDim,
    fontSize: 8.5,
    fontFamily: FONTS.display,
    letterSpacing: 0.4,
    marginTop: 4,
  },
  lockedTxt: { color: PALETTE.inkDim, fontSize: 10,
    fontFamily: FONTS.display, fontWeight: '800', marginTop: 4 },
  // --- Login calendar ---
  loginBox: {
    backgroundColor: PALETTE.hull,
    borderWidth: 1.5,
    borderColor: PALETTE.edge,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
  },
  loginTitle: { color: PALETTE.ink, fontSize: 13,
    fontFamily: FONTS.display, fontWeight: '900', letterSpacing: 1.6 },
  loginSub: { color: PALETTE.inkDim, fontSize: 11, marginTop: 2, marginBottom: 9 },
  loginGrid: { flexDirection: 'row', gap: 4, justifyContent: 'space-between' },
  loginCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: PALETTE.edge,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  loginCellPast: { opacity: 0.45 },
  loginCellToday: { borderColor: PALETTE.gold, backgroundColor: 'rgba(255,201,60,0.10)' },
  loginDay: { color: PALETTE.inkDim, fontSize: 9, fontWeight: '900' },
  loginDayToday: { color: PALETTE.gold },
  loginAmt: { color: COIN_GOLD, fontSize: 10.5, fontWeight: '900', marginTop: 1 },
  loginBtn: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: PALETTE.gold,
    alignItems: 'center',
  },
  loginBtnDone: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: PALETTE.edge },
  loginBtnTxt: { color: '#221703', fontSize: 12, fontWeight: '900', letterSpacing: 1.4 },
  loginBtnTxtDone: { color: PALETTE.inkDim },
});
