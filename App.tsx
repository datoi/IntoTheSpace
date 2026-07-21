import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import GameScreen from './src/screens/GameScreen';
import { MenuScreen, GameOverScreen, ShopScreen } from './src/screens/Screens';
import LoadingScreen from './src/screens/LoadingScreen';
import { loadSave, writeSave, loadRun, saveRun, clearRun, SaveData, DEFAULT_SAVE } from './src/game/storage';
import { preloadAssets } from './src/game/preload';
import { initSounds } from './src/game/sounds';
import { GamePhase, GameState, RunResult } from './src/game/types';
import { PALETTE, AVATARS, DECODE_GRACE_MS, MIN_LOADING_MS } from './src/game/constants';

export default function App() {
  const [phase, setPhase] = useState<GamePhase>('menu');
  const [save, setSave] = useState<SaveData>({ ...DEFAULT_SAVE });
  const [result, setResult] = useState<RunResult>({ coins: 0, altitude: 0 });
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
  const booted = dataReady && decodeReady && minElapsed;

  useEffect(() => {
    let alive = true;
    (async () => {
      const [savedData, run] = await Promise.all([loadSave(), loadRun()]);
      if (!alive) return;
      setSave(savedData);
      setPausedRun(run);
      await preloadAssets((done, total) => {
        if (alive) setProgress(total ? done / total : 1);
      });
      if (alive) setDataReady(true);
    })();
    initSounds();

    const graceTimer = setTimeout(() => setDecodeReady(true), DECODE_GRACE_MS);
    const minTimer = setTimeout(() => setMinElapsed(true), MIN_LOADING_MS);
    return () => {
      alive = false;
      clearTimeout(graceTimer);
      clearTimeout(minTimer);
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

  const persist = useCallback((next: SaveData) => {
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
      const newBest = r.altitude > save.best;
      setIsNewBest(newBest);
      persist({
        ...save,
        best: Math.max(save.best, r.altitude), // best = highest distance reached
        likes: save.likes + r.coins, // wallet key stays `likes` — it is persisted
      });
      discardRun(); // the run is over — nothing to resume
      setPhase('gameover');
    },
    [save, persist, discardRun]
  );

  const buyAvatar = useCallback(
    (id: string) => {
      const def = AVATARS.find((a) => a.id === id);
      if (!def || save.unlocked.includes(id) || save.likes < def.price) return;
      persist({
        ...save,
        likes: save.likes - def.price,
        unlocked: [...save.unlocked, id],
        selectedAvatar: id,
      });
    },
    [save, persist]
  );

  const selectAvatar = useCallback(
    (id: string) => {
      if (!save.unlocked.includes(id)) return;
      persist({ ...save, selectedAvatar: id });
    },
    [save, persist]
  );

  const selectedAvatar = AVATARS.find((a) => a.id === save.selectedAvatar) ?? AVATARS[0];
  const avatarEmoji = selectedAvatar.emoji;
  const avatarImage = selectedAvatar.image;

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
      {phase === 'menu' && (
        <MenuScreen save={save} onStart={startGame} onShop={() => setPhase('shop')} />
      )}
      {phase === 'playing' && (
        <GameScreen
          key={runId}
          best={save.best}
          avatarEmoji={avatarEmoji}
          avatarImage={avatarImage}
          resume={pausedRun}
          startPaused={!!pausedRun}
          onGameOver={handleGameOver}
          onPersist={persistRun}
          onClearRun={discardRun}
          onHome={() => setPhase('menu')}
        />
      )}
      {phase === 'gameover' && (
        <GameOverScreen
          result={result}
          best={save.best}
          isNewBest={isNewBest}
          onRestart={startGame}
          onMenu={() => setPhase('menu')}
        />
      )}
      {phase === 'shop' && (
        <ShopScreen save={save} onBuy={buyAvatar} onSelect={selectAvatar} onBack={() => setPhase('menu')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PALETTE.bg },
});
