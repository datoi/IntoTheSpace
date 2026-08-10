import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import GameScreen from './src/screens/GameScreen';
import { MenuScreen, GameOverScreen, ShopScreen } from './src/screens/Screens';
import { HangarScreen, StatsScreen } from './src/screens/Progress';
import { QuestsScreen } from './src/screens/Quests';
import LoadingScreen from './src/screens/LoadingScreen';
import { AmbientParallax } from './src/components/Parallax';
import { RunBoundary } from './src/components/RunBoundary';
import {
  loadSave,
  writeSave,
  loadRun,
  saveRun,
  clearRun,
  SaveData,
  DEFAULT_SAVE,
  affords,
  spend,
  earn,
} from './src/game/storage';
import { addStats, UpgradeKind, levelOf, withLevel } from './src/game/progression';
import { resolveShipStats, upgradeCost, isMaxed } from './src/game/upgrades';
import {
  Quest,
  Reward,
  applyRun,
  claimLogin,
  claimQuest,
  refreshPeriods,
  unclaimedCount,
} from './src/game/missions';
import { FONT_MAP } from './src/game/type';
import { preloadAssets } from './src/game/preload';
import { initSounds } from './src/game/sounds';
import { GamePhase, GameState, RunResult } from './src/game/types';
import { PALETTE, AVATARS, BACKGROUNDS, avatarSprite, DECODE_GRACE_MS, MIN_LOADING_MS, FONT_GRACE_MS } from './src/game/constants';

// TEMP dev switch — lets you browse/equip every ship and background for free
// (the shop shows a full wallet and nothing is locked). It does NOT spend or
// change your real coins, so flipping it back off restores the normal economy.
// Gated so it never runs under tests (which pin the real economy) or in a
// production release build (__DEV__ is false there). Set to false / delete when
// you're done checking.
const DEV_UNLOCK_ALL = __DEV__ && process.env.NODE_ENV !== 'test';

export default function App() {
  const [phase, setPhase] = useState<GamePhase>('menu');
  const [save, setSave] = useState<SaveData>({ ...DEFAULT_SAVE });
  // The authoritative save between renders. `save` drives the UI; this is what
  // mutation handlers read, so several of them in one event batch each see the
  // previous one's result instead of the render's stale copy. See persist().
  const saveRef = useRef<SaveData>(save);
  const [result, setResult] = useState<RunResult>({
    coins: 0,
    score: 0,
    bestMult: 1,
    grazes: 0,
    altitude: 0,
    crystals: 0,
    chips: 0,
    alloy: 0,
    wave: 0,
    stats: {},
  });
  const [isNewBest, setIsNewBest] = useState(false);
  const [runId, setRunId] = useState(0);
  const [pausedRun, setPausedRun] = useState<GameState | null>(null);
  // Boot gate. Two reasons to hold the UI back:
  //   • storage — acting on the default save before it loads (e.g. finishing a
  //     run) would persist over the stored best/likes, and starting a run would
  //     ignore a resumable snapshot;
  //   • assets — the game loop deals damage from its first frame, so an
  //     un-decoded sprite means invisible ships shooting invisible bullets.
  // Paying both costs once here beats paying them at "LIFT OFF" every run.
  // Boot completes only when all three land, so a warm launch (where the
  // download pass resolves instantly) still waits for pixels.
  const [dataReady, setDataReady] = useState(false); // storage read + assets on disk
  const [decodeReady, setDecodeReady] = useState(false); // sprites painted, or grace elapsed
  const [minElapsed, setMinElapsed] = useState(false); // no sub-frame flash of the loader
  const [progress, setProgress] = useState(0);
  // Fonts join the SAME gate rather than getting their own. The UI is already
  // held back for asset decode, and a second gate would mean a second flash —
  // or worse, text painting in the system face and then reflowing when the real
  // faces land.
  const [fontsLoaded, fontError] = useFonts(FONT_MAP);
  // …but never INDEFINITELY. A font that fails or stalls falls back to the
  // system face rather than hanging the gate forever.
  const [fontGrace, setFontGrace] = useState(false);
  const fontsReady = fontsLoaded || !!fontError || fontGrace;
  const booted = dataReady && decodeReady && minElapsed && fontsReady;

  useEffect(() => {
    let alive = true;
    (async () => {
      const [savedData, run] = await Promise.all([loadSave(), loadRun()]);
      if (!alive) return;
      // Roll the daily/weekly periods forward at boot as well as after a run,
      // so opening the app on a new day shows that day's challenges rather than
      // yesterday's finished ones.
      const loaded: SaveData = {
        ...savedData,
        quests: refreshPeriods(savedData.quests, savedData.stats, Date.now()),
      };
      // The ref has to move with the state — it is what every handler reads.
      saveRef.current = loaded;
      setSave(loaded);
      setPausedRun(run);
      await preloadAssets((done, total) => {
        if (alive) setProgress(total ? done / total : 1);
      });
      if (alive) setDataReady(true);
    })();
    initSounds();

    const graceTimer = setTimeout(() => setDecodeReady(true), DECODE_GRACE_MS);
    const minTimer = setTimeout(() => setMinElapsed(true), MIN_LOADING_MS);
    const fontTimer = setTimeout(() => setFontGrace(true), FONT_GRACE_MS);
    return () => {
      alive = false;
      clearTimeout(graceTimer);
      clearTimeout(minTimer);
      clearTimeout(fontTimer);
    };
  }, []);

  // Snapshot an in-progress run (pause / background / return-home). Deep-copy
  // so App's copy is decoupled from the live, still-mutating game object.
  const persistRun = useCallback((snap: GameState) => {
    const copy: GameState = JSON.parse(JSON.stringify(snap));
    setPausedRun(copy);
    saveRun(copy);
  }, []);

  const discardRun = useCallback(() => {
    setPausedRun(null);
    clearRun();
  }, []);

  /**
   * Apply an update to the save, then store it.
   *
   * Takes an UPDATER, not a finished value, and this is load-bearing. Every
   * mutation handler used to close over `save` and hand back a whole rebuilt
   * object. Two of them firing in one event batch — two fingers landing
   * together on the upgrade screen, or a fast tap pair — both read the same
   * stale `save`, so the second overwrote the first: one purchase silently
   * vanished, uncharged and unapplied. It also meant two writeSave calls with
   * divergent payloads racing each other to disk.
   *
   * `saveRef` is what fixes it: it is advanced SYNCHRONOUSLY here, before
   * setSave has re-rendered anything, so the second call in a batch reads the
   * first one's result rather than the render's stale copy.
   *
   * Returning `prev` unchanged means "declined" — maxed out, can't afford,
   * already owned — and costs neither a render nor a disk write.
   */
  const persist = useCallback((update: (prev: SaveData) => SaveData) => {
    const prev = saveRef.current;
    const next = update(prev);
    if (next === prev) return;
    saveRef.current = next;
    setSave(next);
    writeSave(next);
  }, []);

  const startGame = useCallback(() => {
    setRunId((id) => id + 1);
    setPhase('playing');
  }, []);

  const handleGameOver = useCallback(
    (r: RunResult) => {
      setResult(r);
      // "New best" now means a better SCORE — the thing that measures how the
      // run was played. `save.best` still tracks altitude, so existing players'
      // records and every altitude-based objective keep working unchanged.
      setIsNewBest(r.score > saveRef.current.stats.bestScore);
      persist((prev) => {
        // Bank the run: distance into `best`, every currency into the wallet,
        // and the run's counters into lifetime stats.
        const banked = earn(prev, {
          coins: r.coins,
          crystals: r.crystals,
          chips: r.chips,
          alloy: r.alloy,
        });
        const stats = addStats(prev.stats, r.stats);
        return {
          ...banked,
          best: Math.max(prev.best, r.altitude), // best = highest distance reached
          stats,
          // Quest progress is folded against the UPDATED lifetime stats, so a
          // goal finished by this very run reads as complete immediately rather
          // than only after the next one.
          quests: applyRun(prev.quests, stats, r.stats, Date.now()),
        };
      });
      discardRun(); // the run is over — nothing to resume
      setPhase('gameover');
    },
    [persist, discardRun]
  );

  /**
   * Buy one level on a track for the currently equipped hull.
   *
   * Upgrades are per-ship on purpose — that's what keeps coins valuable after
   * every hull is unlocked. The cost is re-derived from the CURRENT level here
   * rather than trusted from the UI, so a stale screen can't buy a level cheap.
   */
  const buyUpgrade = useCallback(
    (kind: UpgradeKind) => {
      persist((prev) => {
        const shipId = prev.selectedAvatar;
        if (isMaxed(prev.upgrades, shipId, kind)) return prev;
        const level = levelOf(prev.upgrades, shipId, kind);
        const price = upgradeCost(kind, level);
        if (!DEV_UNLOCK_ALL && !affords(prev, price)) return prev;
        const paid = DEV_UNLOCK_ALL ? prev : spend(prev, price);
        return {
          ...paid,
          upgrades: withLevel(prev.upgrades, shipId, kind, level + 1),
          stats: addStats(prev.stats, { upgradesBought: 1 }),
        };
      });
    },
    [persist]
  );

  const buyAvatar = useCallback(
    (id: string) => {
      persist((prev) => {
        const def = AVATARS.find((a) => a.id === id);
        if (!def || prev.unlocked.includes(id)) return prev;
        if (!DEV_UNLOCK_ALL && prev.likes < def.price) return prev;
        return {
          ...prev,
          likes: DEV_UNLOCK_ALL ? prev.likes : prev.likes - def.price,
          unlocked: [...prev.unlocked, id],
          selectedAvatar: id,
        };
      });
    },
    [persist]
  );

  const selectAvatar = useCallback(
    (id: string) => {
      persist((prev) =>
        prev.unlocked.includes(id) ? { ...prev, selectedAvatar: id } : prev
      );
    },
    [persist]
  );

  const buyBackground = useCallback(
    (id: string) => {
      persist((prev) => {
        const def = BACKGROUNDS.find((b) => b.id === id);
        if (!def || prev.unlockedBackgrounds.includes(id)) return prev;
        if (!DEV_UNLOCK_ALL && prev.likes < def.price) return prev;
        return {
          ...prev,
          likes: DEV_UNLOCK_ALL ? prev.likes : prev.likes - def.price,
          unlockedBackgrounds: [...prev.unlockedBackgrounds, id],
          selectedBackground: id,
        };
      });
    },
    [persist]
  );

  const selectBackground = useCallback(
    (id: string) => {
      persist((prev) =>
        prev.unlockedBackgrounds.includes(id) ? { ...prev, selectedBackground: id } : prev
      );
    },
    [persist]
  );

  /**
   * Pay a quest/login reward into the save.
   *
   * Rewards can grant unlocks as well as currency, so this also folds in ship
   * and background grants — additively, never replacing what's already owned.
   */
  const grant = useCallback(
    (base: SaveData, reward: Reward): SaveData => {
      let next = reward.currencies ? earn(base, reward.currencies) : base;
      if (reward.ship && !next.unlocked.includes(reward.ship)) {
        next = { ...next, unlocked: [...next.unlocked, reward.ship] };
      }
      if (reward.background && !next.unlockedBackgrounds.includes(reward.background)) {
        next = { ...next, unlockedBackgrounds: [...next.unlockedBackgrounds, reward.background] };
      }
      return next;
    },
    []
  );

  const claimQuestReward = useCallback(
    (quest: Quest, bucket: 'main' | 'daily' | 'weekly') => {
      // claimQuest re-checks completion and prior claims itself, so a stale
      // screen tapping an already-collected reward is a no-op rather than a
      // second payout.
      persist((prev) => {
        const { quests, reward } = claimQuest(prev.quests, quest, prev.stats, bucket);
        if (!reward) return prev;
        return { ...grant(prev, reward), quests };
      });
    },
    [persist, grant]
  );

  /**
   * Pay out rewards banked by a period rollover.
   *
   * A daily finished at 23:00 and left uncollected used to be destroyed at
   * midnight. refreshPeriods now carries the EARNED ones into quests.pending
   * (it cannot pay them itself — missions.ts owns quest state, not the wallet),
   * and this drains that buffer.
   *
   * Granting and clearing happen inside ONE persist call, so the two can never
   * come apart: if this effect runs twice, the second pass reads an already
   * empty list and declines. Buffering in the save rather than granting at the
   * moment of rollover also means a crash between the two cannot lose the
   * reward — it is still there on the next launch.
   */
  useEffect(() => {
    if (!save.quests.pending?.length) return;
    persist((prev) => {
      const pending = prev.quests.pending ?? [];
      if (!pending.length) return prev;
      let next = prev;
      for (const reward of pending) next = grant(next, reward);
      return { ...next, quests: { ...next.quests, pending: [] } };
    });
  }, [save.quests.pending, persist, grant]);

  const claimDailyLogin = useCallback(() => {
    persist((prev) => {
      const { login, reward } = claimLogin(prev.quests.login, Date.now());
      if (!reward) return prev; // already claimed today
      return { ...grant(prev, reward), quests: { ...prev.quests, login } };
    });
  }, [persist, grant]);

  // Dev browse mode shows a full wallet so everything reads affordable. This is
  // display-only — `save` (what gets persisted) keeps the real balance.
  const shopSave = DEV_UNLOCK_ALL
    ? { ...save, likes: 999999, crystals: 9999, chips: 9999, alloy: 9999 }
    : save;

  const selectedAvatar = AVATARS.find((a) => a.id === save.selectedAvatar) ?? AVATARS[0];
  const selectedBackground = BACKGROUNDS.find((b) => b.id === save.selectedBackground) ?? BACKGROUNDS[0];
  // The equipped hull's permanent upgrades, flattened to the numbers the game
  // loop reads. Recomputed only when the ship or its levels actually change,
  // so GameScreen's `shipStats` prop stays referentially stable across renders
  // (it feeds a ref inside the loop, and a new object every render would churn).
  const shipStats = useMemo(
    () => resolveShipStats(save.upgrades, save.selectedAvatar),
    [save.upgrades, save.selectedAvatar]
  );
  // The hull as it is actually built: upgrade investment earns a cosmetic tier
  // (see TIER_THRESHOLDS) and that tier picks one of five sprites, so the ship
  // on screen grows with the ship in the numbers.
  const avatarImage = avatarSprite(selectedAvatar, shipStats.tier);

  // Badge on the menu's OBJECTIVES button. Recomputed only when progress moves,
  // since it walks every catalog.
  const rewardsWaiting = useMemo(
    () => unclaimedCount(save.quests, save.stats, Date.now()),
    [save.quests, save.stats]
  );

  if (!booted) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <LoadingScreen progress={progress} onSpritesDecoded={() => setDecodeReady(true)} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {/* The player's own sky, drifting behind every shell. Mounted OUTSIDE the
          phase switch so it survives navigation without restarting its drift. */}
      {phase !== 'playing' && (
        <AmbientParallax key={selectedBackground.id} set={selectedBackground.set} />
      )}
      {phase === 'menu' && (
        <MenuScreen
          save={shopSave}
          rewardsWaiting={rewardsWaiting}
          onStart={startGame}
          onShop={() => setPhase('shop')}
          onHangar={() => setPhase('hangar')}
          onStats={() => setPhase('stats')}
          onQuests={() => setPhase('quests')}
        />
      )}
      {phase === 'playing' && (
        // A run that fails must never cost more than the run — see RunBoundary.
        // Keyed with the run so a fresh LIFT OFF always gets a clean boundary
        // rather than inheriting the failed state of the previous attempt.
        <RunBoundary
          key={`boundary-${runId}`}
          onDiscardRun={discardRun}
          onHome={() => setPhase('menu')}
        >
          <GameScreen
            key={runId}
            best={save.best}
            avatarImage={avatarImage}
            avatarShot={selectedAvatar.shot}
            avatarSpecial={selectedAvatar.special}
            shipStats={shipStats}
            background={selectedBackground.set}
            resume={pausedRun}
            startPaused={!!pausedRun}
            onGameOver={handleGameOver}
            onPersist={persistRun}
            onClearRun={discardRun}
            onHome={() => setPhase('menu')}
          />
        </RunBoundary>
      )}
      {phase === 'gameover' && (
        <GameOverScreen
          result={result}
          best={save.best}
          bestScore={save.stats.bestScore}
          isNewBest={isNewBest}
          onRestart={startGame}
          onMenu={() => setPhase('menu')}
        />
      )}
      {phase === 'shop' && (
        <ShopScreen
          save={shopSave}
          onBuyAvatar={buyAvatar}
          onSelectAvatar={selectAvatar}
          onBuyBackground={buyBackground}
          onSelectBackground={selectBackground}
          onBack={() => setPhase('menu')}
        />
      )}
      {phase === 'hangar' && (
        <HangarScreen
          save={shopSave}
          shipStats={shipStats}
          onBuyUpgrade={buyUpgrade}
          onSelectAvatar={selectAvatar}
          onBack={() => setPhase('menu')}
        />
      )}
      {phase === 'stats' && <StatsScreen save={save} onBack={() => setPhase('menu')} />}
      {phase === 'quests' && (
        <QuestsScreen
          save={save}
          onClaim={claimQuestReward}
          onClaimLogin={claimDailyLogin}
          onBack={() => setPhase('menu')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PALETTE.void },
});
