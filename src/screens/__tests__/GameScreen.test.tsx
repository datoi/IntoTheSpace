import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import GameScreen from '../GameScreen';
import { GameState, Card, EnemyBullet } from '../../game/types';
import {
  laneX,
  AVATAR_Y,
  AVATAR_SIZE,
  HEARTS_START,
  HEARTS_MAX,
  ENEMY_SHIPS,
  BOSS_MINI_IMG,
  BOSS_GIANT_IMG,
  GUN_LABEL,
  MAX_GUN_LEVEL,
  OB_HIT,
  SCREEN,
  BOSS_SWAY_FREQ,
  BOSS_SWAY_AMP,
  BOSS_MINI_COINS,
  BOSS_GIANT_COINS,
  FEED_PAD,
  BACKGROUNDS,
  AVATARS,
} from '../../game/constants';

/**
 * The game loop runs on requestAnimationFrame; Jest fake timers drive it one
 * 16ms frame at a time via jest.advanceTimersByTime. Scenarios are set up by
 * resuming from a crafted GameState snapshot (the same path a restored run
 * takes), which keeps the tests deterministic.
 */

const AVATAR_X = laneX(1);

// A quiet baseline: all spawn timers pushed far out so nothing random drops
// into the scene during a short test window.
const quietState = (over: Partial<GameState> = {}): GameState => ({
  avatarX: AVATAR_X,
  avatarY: AVATAR_Y,
  targetX: AVATAR_X,
  targetY: AVATAR_Y,
  dragDX: 0,
  dragDY: 0,
  dragging: false,
  alt: 0,
  wave: 1,
  waveClearTimer: 999,
  gun: 'single',
  gunTime: 0,
  gunLevel: 1,
  fireTimer: 999,
  giftTimer: 999,
  heartTimer: 999,
  coinTimer: 999,
  enemyFireTimer: 999,
  bullets: [],
  enemyBullets: [],
  cards: [],
  particles: [],
  floats: [],
  elapsed: 0,
  distTimer: 0,
  hearts: HEARTS_START,
  coins: 0,
  shake: 0,
  hitFlash: 0,
  nextId: 1000,
  ...over,
});

let nextCardId = 1;
const card = (over: Partial<Card>): Card => ({
  id: nextCardId++,
  kind: 'rage',
  lane: 1,
  y: 200,
  h: OB_HIT,
  emoji: '',
  hp: 1,
  maxHp: 1,
  hitT: 0,
  shipIdx: 0,
  dead: false,
  deadT: 0,
  nearMissChecked: false,
  ...over,
});

const renderGame = async (resume?: GameState, extraProps: Record<string, unknown> = {}) => {
  const onGameOver = jest.fn();
  const onPersist = jest.fn();
  const onClearRun = jest.fn();
  const onHome = jest.fn();
  await render(
    <GameScreen
      best={0}
      avatarEmoji="🚀"
      avatarShot={AVATARS[0].shot}
      background={BACKGROUNDS[0].set}
      resume={resume ?? null}
      onGameOver={onGameOver}
      onPersist={onPersist}
      onClearRun={onClearRun}
      onHome={onHome}
      {...extraProps}
    />
  );
  return { onGameOver, onPersist, onClearRun, onHome };
};

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

// Center x of the rendered boss: its wrapper View is positioned by its left
// edge, so add back half the sprite's width.
const bossCenterX = (): number => {
  let found: number | undefined;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    const kids: any[] = node.children ?? [];
    if (kids.some((k) => k?.type === 'Image' && k.props.source === BOSS_MINI_IMG)) {
      const style = Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
      found = style.left + style.width / 2;
    }
    kids.forEach(walk);
  };
  walk(screen.toJSON());
  if (found === undefined) throw new Error('no boss rendered');
  return found;
};

const countImages = (source: unknown): number => {
  let count = 0;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Image' && node.props.source === source) count++;
    (node.children ?? []).forEach(walk);
  };
  walk(screen.toJSON());
  return count;
};

// Health now shows as a vertical bar: the fill is the only node with a
// percentage height. Convert that fraction back to a heart count.
const heartsFromBar = (): number => {
  let pct = 0;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    const style = Object.assign({}, ...[node.props?.style].flat(Infinity).filter(Boolean));
    if (typeof style.height === 'string' && style.height.endsWith('%')) pct = parseFloat(style.height);
    (node.children ?? []).forEach(walk);
  };
  walk(screen.toJSON());
  return Math.round((pct / 100) * HEARTS_MAX);
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('GameScreen — rendering & HUD', () => {
  it('starts a fresh run with 0 score and full hearts', async () => {
    await renderGame();
    expect(screen.getByText('0')).toBeTruthy();
    expect(heartsFromBar()).toBe(HEARTS_START);
    expect(screen.getByText('❚❚')).toBeTruthy(); // pause button
  });

  it('climbs: altitude on the HUD increases as the loop runs', async () => {
    await renderGame();
    await advance(500);
    // ~0.5s at 120 m/s ≈ 60m (first frame has dt=0)
    const altText = screen.getByText(/🚀 \d+m/).props.children.join('');
    const meters = parseInt(altText.match(/\d+/)![0], 10);
    expect(meters).toBeGreaterThan(30);
    expect(meters).toBeLessThan(90);
  });

});

describe('GameScreen — waves', () => {
  it('drops the first wave of 3 enemies with a WAVE 1 banner', async () => {
    await renderGame(); // fresh run: waveClearTimer 0.8
    await advance(1000);
    expect(screen.getByText('WAVE 1')).toBeTruthy();
    expect(countImages(ENEMY_SHIPS[0])).toBe(3);
  });

  it('spawns a mini boss on wave 5', async () => {
    await renderGame(quietState({ wave: 4, waveClearTimer: 0.01 }));
    await advance(100);
    expect(screen.getByText('⚠️ WAVE 5 — MINI BOSS')).toBeTruthy();
    expect(countImages(BOSS_MINI_IMG)).toBe(1);
  });

  it('spawns a giant boss on wave 10', async () => {
    await renderGame(quietState({ wave: 9, waveClearTimer: 0.01 }));
    await advance(100);
    expect(screen.getByText('☠️ WAVE 10 — GIANT BOSS')).toBeTruthy();
    expect(countImages(BOSS_GIANT_IMG)).toBe(1);
  });
});

describe('GameScreen — collisions & pickups', () => {
  it('catching a ❤️ restores a heart', async () => {
    const resume = quietState({
      cards: [card({ kind: 'heart', emoji: '❤️', y: AVATAR_Y + 10 })],
    });
    await renderGame(resume);
    await advance(100);
    expect(heartsFromBar()).toBe(HEARTS_START + 1);
    expect(screen.getByText('+1 ❤️')).toBeTruthy();
  });

  it('collecting a coin banks it and shows the pickup float', async () => {
    const resume = quietState({
      coins: 4,
      cards: [card({ kind: 'coin', emoji: '', y: AVATAR_Y + 10 })],
    });
    await renderGame(resume);
    await advance(100);
    expect(screen.getByText('+1 COIN')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy(); // HUD coin counter
  });

  it('a coin cannot be shot down like an enemy', async () => {
    const resume = quietState({
      gun: 'single',
      fireTimer: 0.01,
      cards: [card({ kind: 'coin', emoji: '', y: AVATAR_Y - 200 })],
    });
    const { onPersist } = await renderGame(resume);
    await advance(400);
    await fireEvent.press(screen.getByText('❚❚'));
    const snap: GameState = onPersist.mock.calls[0][0];
    expect(snap.cards.some((c) => c.kind === 'coin' && !c.dead)).toBe(true);
  });

  it('caps hearts at HEARTS_MAX', async () => {
    const resume = quietState({
      hearts: 10,
      cards: [card({ kind: 'heart', emoji: '❤️', y: AVATAR_Y + 10 })],
    });
    await renderGame(resume);
    await advance(100);
    expect(heartsFromBar()).toBe(10);
  });

  it('colliding with an enemy costs a heart', async () => {
    const resume = quietState({
      cards: [card({ y: AVATAR_Y + 10 })],
    });
    await renderGame(resume);
    await advance(100);
    expect(heartsFromBar()).toBe(HEARTS_START - 1);
    expect(screen.getByText('-1 💔')).toBeTruthy();
  });

  it('an enemy bullet on contact costs a heart and is consumed', async () => {
    const bullet: EnemyBullet = {
      id: 900,
      x: AVATAR_X,
      y: AVATAR_Y + AVATAR_SIZE / 2,
      vx: 0,
      vy: 50,
      kind: 'straight',
      color: '#FF0000',
      size: 11,
      phase: 0,
      life: 6,
      shipIdx: 0,
    };
    const resume = quietState({ enemyBullets: [bullet] });
    await renderGame(resume);
    await advance(100);
    expect(heartsFromBar()).toBe(HEARTS_START - 1);
    // Consumed: only one heart lost even after more frames.
    await advance(300);
    expect(heartsFromBar()).toBe(HEARTS_START - 1);
  });

  it('enemies shoot back and their aimed shot eventually hits a static player', async () => {
    const resume = quietState({
      cards: [card({ y: 200, hp: 50, maxHp: 50 })], // aligned above the player
      enemyFireTimer: 0.01,
    });
    await renderGame(resume);
    await advance(5000); // straight shot at 210px/s covers ~760px in ~3.6s
    expect(heartsFromBar()).toBeLessThan(HEARTS_START);
  });
});

describe('GameScreen — escalating enemy behavior', () => {
  it('wave 15+: a homing rocket tracks and hits a static player', async () => {
    const resume = quietState({
      wave: 15,
      cards: [card({ y: 400, hp: 50, maxHp: 50, shipIdx: 2 })],
      enemyFireTimer: 0.01,
    });
    await renderGame(resume);
    await advance(4200); // 165px/s homing shot covers ~590px well inside its 4.5s life
    expect(heartsFromBar()).toBeLessThan(HEARTS_START);
  });

  it('wave 20+: a wounded formation enemy charges the player and connects', async () => {
    const resume = quietState({
      wave: 20,
      cards: [card({ y: 150, holdY: 150, hp: 1, maxHp: 14 })], // wounded → charges
    });
    await renderGame(resume);
    await advance(7200); // charge speed 120px/s over ~780px
    expect(heartsFromBar()).toBe(HEARTS_START - 1);
    expect(screen.getByText('-1 💔')).toBeTruthy();
  });

  it('a boss starts swaying from where it descended, not mid-swing', async () => {
    // elapsed × BOSS_SWAY_FREQ ≈ π/2, so a run-time-driven sine would be at
    // full deflection the frame the boss lands and snap ~0.3 screens sideways.
    const elapsed = Math.PI / 2 / BOSS_SWAY_FREQ;
    const boss = card({
      boss: 'mini',
      y: 145,
      holdY: 150, // lands within a couple of frames
      h: 82,
      w: 82,
      hp: 30,
      maxHp: 30,
      cx: SCREEN.W / 2,
      shipIdx: 0,
    });
    await renderGame(quietState({ cards: [boss], elapsed }));
    await advance(100); // long enough to land and begin swaying

    // Anchored, the boss eases out of its descent point; run-time-driven it
    // would already be a full deflection (0.3 × screen width) off center.
    const settled = bossCenterX();
    const fullDeflection = SCREEN.W * BOSS_SWAY_AMP;
    expect(Math.abs(settled - SCREEN.W / 2)).toBeLessThan(fullDeflection / 5);

    // ...and it is genuinely swaying, not just parked in the middle.
    await advance(600);
    expect(Math.abs(bossCenterX() - SCREEN.W / 2)).toBeGreaterThan(Math.abs(settled - SCREEN.W / 2));
  });

  // A holding boss sways around screen centre, so the ship has to be centred
  // under it (and close) for a shot to connect before the sway carries it off.
  const killableBoss = (over: Partial<Card>): GameState =>
    quietState({
      avatarX: SCREEN.W / 2,
      targetX: SCREEN.W / 2,
      fireTimer: 0.01,
      cards: [
        card({
          boss: 'mini',
          y: AVATAR_Y - 100,
          holdY: AVATAR_Y - 100,
          h: 82,
          w: 82,
          hp: 1, // one shot finishes it
          maxHp: 1,
          shipIdx: 0,
          ...over,
        }),
      ],
    });

  // The ship has to sit in the drop zone to land the kill, so part of the fan
  // is banked on the way down: the payout is what's still falling plus what
  // has already been collected. The window covers the kill plus enough time for
  // some coins to drift down through the ship — pickups fall at PICKUP_FALL_SCALE
  // of world speed (~93px/s here), so this is longer than the drop is fast.
  const bossPayout = async (state: GameState) => {
    const { onPersist } = await renderGame(state);
    await advance(1200);
    await fireEvent.press(screen.getByText('❚❚'));
    const snap: GameState = onPersist.mock.calls[0][0];
    const falling = snap.cards.filter((c) => c.kind === 'coin' && !c.dead);
    return { falling, banked: snap.coins, total: falling.length + snap.coins };
  };

  it('a killed mini boss pays out a fan of coins', async () => {
    const { total } = await bossPayout(killableBoss({}));
    expect(total).toBe(BOSS_MINI_COINS);
  });

  it('boss coins are collectable, not just decoration', async () => {
    const { banked } = await bossPayout(killableBoss({}));
    expect(banked).toBeGreaterThan(0); // the ship flew through part of the fan
  });

  it('a giant boss pays out more, all of it inside the play area', async () => {
    const { total, falling } = await bossPayout(killableBoss({ boss: 'giant', h: 132, w: 132 }));
    expect(total).toBe(BOSS_GIANT_COINS);
    expect(BOSS_GIANT_COINS).toBeGreaterThan(BOSS_MINI_COINS);
    for (const c of falling) {
      expect(c.cx!).toBeGreaterThanOrEqual(FEED_PAD);
      expect(c.cx!).toBeLessThanOrEqual(SCREEN.W - FEED_PAD);
    }
  });

  it('a boss adds its own fan of shots on top of the regular volley', async () => {
    const boss = card({
      boss: 'mini',
      y: 150,
      holdY: 150,
      h: 82,
      w: 82,
      hp: 30,
      maxHp: 30,
      cx: AVATAR_X,
      shipIdx: 0,
    });
    const resume = quietState({ cards: [boss], enemyFireTimer: 0.01 });
    await renderGame(resume);
    await advance(200); // one fire event: 1 volley shot + 2 fan shots
    // Enemy shots draw the tier-0 orb sprite; the hidden prewarm strip mounts one more.
    const { ENEMY_SHOTS } = require('../../game/constants');
    expect(countImages(ENEMY_SHOTS[0])).toBe(4);
  });
});

describe('GameScreen — guns & bullets', () => {
  it('the single gun destroys an enemy', async () => {
    const resume = quietState({
      cards: [card({ y: AVATAR_Y - 200 })], // hp 1, same lane as the player
      fireTimer: 0.01,
    });
    await renderGame(resume);
    await advance(700); // shot lands ~0.28s in, then a 0.18s death pop
    expect(countImages(ENEMY_SHIPS[0])).toBe(0);
  });

  it('a gift grants a gun with its HUD banner and full timer', async () => {
    const rand = jest.spyOn(Math, 'random').mockReturnValue(0); // roll "double"
    const resume = quietState({
      cards: [card({ kind: 'gift', emoji: '🎁', y: AVATAR_Y + 10 })],
    });
    await renderGame(resume);
    await advance(100);
    expect(screen.getByText(`${GUN_LABEL.double} · 16s`)).toBeTruthy();
    rand.mockRestore();
  });

  it('re-collecting the same gun stacks it instead of resetting', async () => {
    const rand = jest.spyOn(Math, 'random').mockReturnValue(0); // always "double"
    const resume = quietState({
      gun: 'double',
      gunTime: 10,
      gunLevel: 1,
      cards: [card({ kind: 'gift', emoji: '🎁', y: AVATAR_Y + 10 })],
    });
    await renderGame(resume);
    await advance(100);
    expect(screen.getByText(`${GUN_LABEL.double} ×2 · 16s`)).toBeTruthy();
    rand.mockRestore();
  });

  it('a third pickup doubles the stack again: ×2 becomes ×4', async () => {
    const resume = quietState({
      gun: 'laser',
      gunTime: 3,
      gunLevel: 2, // already picked up twice
      cards: [card({ kind: 'gift', gun: 'laser', y: AVATAR_Y + 10 })],
    });
    await renderGame(resume);
    await advance(100);
    expect(screen.getByText(`${GUN_LABEL.laser} ×4 · 16s`)).toBeTruthy();
  });

  it('stacking holds at the cap: a fourth pickup refreshes the timer only', async () => {
    const resume = quietState({
      gun: 'laser',
      gunTime: 3,
      gunLevel: MAX_GUN_LEVEL,
      cards: [card({ kind: 'gift', gun: 'laser', y: AVATAR_Y + 10 })],
    });
    await renderGame(resume);
    await advance(100);
    expect(screen.getByText(`${GUN_LABEL.laser} ×${MAX_GUN_LEVEL} · 16s`)).toBeTruthy();
  });

  it('grants the gun the drop was carrying, not a fresh roll', async () => {
    // Math.random would roll GIFT_GUNS[0] ("double") — the card's own gun wins.
    const rand = jest.spyOn(Math, 'random').mockReturnValue(0);
    const resume = quietState({
      cards: [card({ kind: 'gift', gun: 'homing', y: AVATAR_Y + 10 })],
    });
    await renderGame(resume);
    await advance(100);
    // The HUD banner carries the timer; the pickup float shows the bare label.
    expect(screen.getByText(`${GUN_LABEL.homing} · 16s`)).toBeTruthy();
    rand.mockRestore();
  });

  it('a stacked homing volley locks each rocket onto a different enemy', async () => {
    const resume = quietState({
      gun: 'homing',
      gunTime: 10,
      gunLevel: 2, // two rockets per volley
      fireTimer: 0.01,
      cards: [
        card({ y: AVATAR_Y - 200, lane: 0, hp: 9, maxHp: 9 }),
        card({ y: AVATAR_Y - 260, lane: 3, hp: 9, maxHp: 9 }),
      ],
    });
    const { onPersist } = await renderGame(resume);
    await advance(60); // one volley, before anything can be destroyed
    await fireEvent.press(screen.getByText('❚❚')); // pause snapshots the state
    const snap: GameState = onPersist.mock.calls[0][0];
    const locks = snap.bullets.filter((b) => b.kind === 'rocket').map((b) => b.targetId);
    expect(locks).toHaveLength(2);
    expect(new Set(locks).size).toBe(2); // two rockets, two different enemies
  });

  it('a homing volley reuses targets only when it outnumbers the enemies', async () => {
    const resume = quietState({
      gun: 'homing',
      gunTime: 10,
      gunLevel: 2,
      fireTimer: 0.01,
      cards: [card({ y: AVATAR_Y - 200, lane: 0, hp: 9, maxHp: 9 })], // only one
    });
    const { onPersist } = await renderGame(resume);
    await advance(60);
    await fireEvent.press(screen.getByText('❚❚'));
    const snap: GameState = onPersist.mock.calls[0][0];
    const locks = snap.bullets.filter((b) => b.kind === 'rocket').map((b) => b.targetId);
    expect(locks).toHaveLength(2);
    expect(new Set(locks).size).toBe(1); // nothing else to lock onto
  });

  it('a gift gun expires back to the single shooter', async () => {
    const resume = quietState({ gun: 'laser', gunTime: 0.05 });
    await renderGame(resume);
    expect(screen.getByText(new RegExp(GUN_LABEL.laser))).toBeTruthy();
    await advance(300);
    expect(screen.queryByText(new RegExp(GUN_LABEL.laser))).toBeNull();
  });

  it('homing rockets steer across lanes to kill an off-axis enemy', async () => {
    const resume = quietState({
      gun: 'homing',
      gunTime: 10,
      fireTimer: 0.01,
      cards: [card({ lane: 3, y: AVATAR_Y - 300 })], // two lanes to the right
    });
    await renderGame(resume);
    await advance(1100); // steers across, kills, then the death pop clears
    expect(countImages(ENEMY_SHIPS[0])).toBe(0);
  });

  it('bombs splash: a nearby second enemy dies from the blast alone', async () => {
    const resume = quietState({
      gun: 'bomb',
      gunTime: 10,
      fireTimer: 0.01,
      cards: [
        card({ y: AVATAR_Y - 200, hp: 20, maxHp: 20 }), // tank absorbs the direct hit
        card({ y: AVATAR_Y - 270, hp: 3, maxHp: 3 }), // in splash range above it
      ],
    });
    await renderGame(resume);
    await advance(500);
    // The tank survives the direct hit; only the splash victim dies.
    expect(countImages(ENEMY_SHIPS[0])).toBe(1);
  });

  it('lasers pierce: one beam kills two stacked enemies', async () => {
    const resume = quietState({
      gun: 'laser',
      gunTime: 10,
      fireTimer: 0.01,
      cards: [
        card({ y: AVATAR_Y - 200, hp: 4, maxHp: 4 }),
        card({ y: AVATAR_Y - 270, hp: 4, maxHp: 4 }),
      ],
    });
    await renderGame(resume);
    await advance(450); // before the second beam (0.5s fire rate) matters
    expect(countImages(ENEMY_SHIPS[0])).toBe(0); // one beam took both
  });
});

describe('GameScreen — game over', () => {
  it('reports the run result once when the last heart is lost', async () => {
    const resume = quietState({
      hearts: 1,
      coins: 4,
      cards: [card({ y: AVATAR_Y + 10 })],
    });
    const { onGameOver, onClearRun } = await renderGame(resume);
    await advance(200);
    expect(onGameOver).toHaveBeenCalledTimes(1);
    const result = onGameOver.mock.calls[0][0];
    expect(result.coins).toBe(4);
    expect(result.altitude).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.altitude)).toBe(true);
    expect(onClearRun).not.toHaveBeenCalled(); // App owns clearing on game over
    // The loop halts: no duplicate report.
    await advance(1000);
    expect(onGameOver).toHaveBeenCalledTimes(1);
  });
});

describe('GameScreen — pause / resume / navigation', () => {
  it('opens paused when resuming a snapshotted run', async () => {
    await renderGame(quietState({ alt: 500 }), { startPaused: true });
    expect(screen.getByText('PAUSED')).toBeTruthy();
    // Both the HUD and the pause overlay show the frozen altitude.
    expect(screen.getAllByText('🚀 500m').length).toBe(2);
    // Loop is halted: altitude does not move while paused.
    await advance(1000);
    expect(screen.getAllByText('🚀 500m').length).toBe(2);
  });

  it('pause button freezes the game and snapshots the run', async () => {
    const { onPersist } = await renderGame(quietState({ coins: 42 }));
    await advance(100);
    await fireEvent.press(screen.getByText('❚❚'));
    expect(screen.getByText('PAUSED')).toBeTruthy();
    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(onPersist.mock.calls[0][0].coins).toBe(42);
  });

  it('CONTINUE resumes the loop', async () => {
    await renderGame(quietState({ alt: 500 }), { startPaused: true });
    await fireEvent.press(screen.getByText('CONTINUE'));
    expect(screen.queryByText('PAUSED')).toBeNull();
    await advance(1000);
    const altText = screen.getByText(/🚀 \d+m/).props.children.join('');
    expect(parseInt(altText.match(/\d+/)![0], 10)).toBeGreaterThan(500);
  });

  it('NEW GAME resets the run and discards the snapshot', async () => {
    const { onClearRun } = await renderGame(
      quietState({ coins: 999, alt: 4000 }),
      { startPaused: true }
    );
    await fireEvent.press(screen.getByText('NEW GAME'));
    expect(onClearRun).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('PAUSED')).toBeNull();
    expect(screen.getByText('0')).toBeTruthy(); // coins reset
  });

  it('RETURN TO HOME snapshots the run and leaves', async () => {
    const { onPersist, onHome } = await renderGame(quietState({ coins: 13 }), {
      startPaused: true,
    });
    await fireEvent.press(screen.getByText('RETURN TO HOME'));
    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(onPersist.mock.calls[0][0].coins).toBe(13);
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it('unmounting mid-run stops the loop cleanly (no leaked frame callbacks)', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    await renderGame();
    await advance(200);
    await screen.unmount();
    await advance(500); // any leaked rAF would fire against the unmounted tree
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe('GameScreen — zigzag fire & drag movement', () => {
  it('wave 5+: enemy shots weave (zigzag kind with lateral sway)', async () => {
    const resume = quietState({
      wave: 5,
      cards: [card({ y: 200, hp: 50, maxHp: 50 })], // directly above the player
      enemyFireTimer: 0.01,
    });
    const { onPersist } = await renderGame(resume);
    // Sample the same bullet at three moments via pause snapshots. A straight
    // shot aimed dead-down has vx = 0 and would keep a constant x; the zigzag
    // sway is the only thing that can move it laterally between samples.
    const xs: number[] = [];
    let bulletId: number | undefined;
    await advance(500);
    for (let i = 0; i < 3; i++) {
      await fireEvent.press(screen.getByText('❚❚'));
      const snap: GameState = onPersist.mock.calls[i][0];
      expect(snap.enemyBullets.length).toBeGreaterThanOrEqual(1);
      for (const b of snap.enemyBullets) {
        expect(b.kind).toBe('zigzag');
        expect(Number.isFinite(b.x)).toBe(true);
        expect(b.vx).toBeCloseTo(0);
      }
      bulletId = bulletId ?? snap.enemyBullets[0].id;
      const tracked = snap.enemyBullets.find((b) => b.id === bulletId);
      if (tracked) xs.push(tracked.x);
      await fireEvent.press(screen.getByText('CONTINUE'));
      await advance(150);
    }
    expect(xs.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.5);
  });

  it('a dragged rocket lerps to the target and clamps to the play area', async () => {
    const resume = quietState({
      dragging: true,
      targetX: SCREEN.W * 2, // way past the right edge
      targetY: -5000, // way past the top
    });
    const { onPersist } = await renderGame(resume);
    await advance(500); // lerp fully converges, then clamps hold
    await fireEvent.press(screen.getByText('❚❚'));
    const snap: GameState = onPersist.mock.calls[0][0];
    expect(snap.avatarX).toBe(SCREEN.W - FEED_PAD - AVATAR_SIZE / 2);
    expect(snap.avatarY).toBe(60);
  });
});
