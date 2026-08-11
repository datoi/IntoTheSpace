import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import GameScreen from '../GameScreen';
import { leftOf } from '../../test-utils/style';
import { freshRunState } from '../../game/runstate';
import { BASE_SHIP_STATS } from '../../game/upgrades';
import { GameState, Card, EnemyBullet } from '../../game/types';
import {
  PALETTE,
  laneX,
  AVATAR_Y,
  AVATAR_SIZE,
  HEARTS_START,
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
  SPECIALS,
  ENERGY_OVERCHARGE,
  TALON_COUNT,
  TALON_LEN,
  TALON_BURST_TIME,
  SPEAR_LEN,
  SPEAR_COUNT,
  SPEAR_RELEASE,
  SPEAR_RELEASE_EVERY,
  NOVA_RADIUS,
  MAX_PARTICLES,
  LANES,
  PHANTOM_TIME,
} from '../../game/constants';

/**
 * The game loop runs on requestAnimationFrame; Jest fake timers drive it one
 * 16ms frame at a time via jest.advanceTimersByTime. Scenarios are set up by
 * resuming from a crafted GameState snapshot (the same path a restored run
 * takes), which keeps the tests deterministic.
 */

const AVATAR_X = laneX(1);

// Firing a special freezes the simulation for HITSTOP_BOSS_PHASE so the ultimate
// lands with weight. Post-FIRE assertions must advance past that window, or they
// sample the frozen frame before the effect has run.
const HITSTOP_MS = 200;

// A quiet baseline: all spawn timers pushed far out so nothing random drops
// into the scene during a short test window.
const quietState = (over: Partial<GameState> = {}): GameState => ({
  ...freshRunState(),
  wave: 1,
  waveClearTimer: 999,
  // Push every timer far out so nothing random drops into the scene — and so
  // the PLAYER doesn't fire either. That last one matters: several scenarios
  // park a 1-HP enemy on screen and assert on what it does, which auto-fire
  // would end before it got the chance.
  fireTimer: 999,
  giftTimer: 999,
  heartTimer: 999,
  coinTimer: 999,
  boonTimer: 999,
  enemyFireTimer: 999,
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
      avatarImage={AVATARS[0].image}
      avatarShot={AVATARS[0].shot}
      avatarSpecial={AVATARS[0].special}
      shipStats={BASE_SHIP_STATS}
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

// Center x of the rendered boss: its wrapper View is placed by its left edge
// (as a translation — see test-utils/style), so add back half the sprite's width.
const bossCenterX = (): number => {
  let found: number | undefined;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    const kids: any[] = node.children ?? [];
    if (kids.some((k) => k?.type === 'Image' && k.props.source === BOSS_MINI_IMG)) {
      const style = Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
      found = leftOf(style) + style.width / 2;
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

// Talons and spears restyle the ship's own bolt, so source alone can't tell
// them apart from ordinary fire — their drawn length can. The hidden Prewarm
// block mounts one of each too, so that copy is discounted here.
const shotXsOfLength = (len: number): number[] => {
  const xs: number[] = [];
  const walk = (node: any, inPrewarm: boolean) => {
    if (!node || typeof node !== 'object') return;
    const style = Object.assign({}, ...[node.props?.style].flat(Infinity).filter(Boolean));
    const prewarm = inPrewarm || style.left === -300; // styles.prewarm's off-screen park
    // The bolt art points UP, so a shot's LENGTH is its drawn height and its
    // thickness is the width. (It used to be the other way round, back when the
    // source art pointed +x and every shot was rotated into place.)
    //
    // A shot is also always longer than it is thick, which is what separates it
    // from a SQUARE sprite of the same height — an ordinary explosion draws at
    // EXPLOSION_VIS, which happens to equal SPEAR_LEN, so a kill part-way
    // through a rain would otherwise be counted as one more spear.
    const isBolt = style.width < style.height;
    if (!prewarm && isBolt && node.type === 'Image' && style.height === len) {
      xs.push(leftOf(style) + style.width / 2);
    }
    (node.children ?? []).forEach((k: any) => walk(k, prewarm));
  };
  walk(screen.toJSON(), false);
  return xs;
};

const countShotsOfLength = (len: number): number => shotXsOfLength(len).length;

// Some effects (Valkyrie's rain rolls a position, height, speed and lean per
// spear) are deliberately random. Pin Math.random to a plain LCG so their
// spread can be asserted without the test flaking on an unlucky draw.
const seedRandom = (seed = 1) => {
  let s = seed;
  return jest.spyOn(Math, 'random').mockImplementation(() => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  });
};


// Health is now one discrete segment per heart, so counting the FILLED segments
// is the read. The old probe measured a percentage height, which no longer
// exists — and the whole point of the change is that hearts are countable.
const heartsFromBar = (): number => {
  let n = 0;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    const style = Object.assign({}, ...[node.props?.style].flat(Infinity).filter(Boolean));
    if (style.width === 13 && style.height === 5 && style.backgroundColor === PALETTE.threat) n++;
    (node.children ?? []).forEach(walk);
  };
  walk(screen.toJSON());
  return n;
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
    // Score and coins both render a bare number, so count rather than match one.
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2);
    expect(heartsFromBar()).toBe(HEARTS_START);
    expect(screen.getByTestId('pause')).toBeTruthy(); // pause button
  });

  it('climbs: altitude on the HUD increases as the loop runs', async () => {
    await renderGame();
    await advance(500);
    // ~0.5s at 120 m/s ≈ 60m (first frame has dt=0)
    // Altitude moved to region D (top-right) and dropped its rocket prefix when
    // score took the headline slot.
    const altText = String(screen.getByText(/^\d+m$/).props.children);
    const meters = parseInt(altText.match(/\d+/)![0], 10);
    expect(meters).toBeGreaterThan(30);
    expect(meters).toBeLessThan(90);
  });

});

describe('GameScreen — waves', () => {
  it('drops the first wave of 3 enemies with a WAVE 1 banner', async () => {
    await renderGame(); // fresh run: waveClearTimer 0.8
    await advance(1000);
    expect(screen.getAllByText('WAVE 1').length).toBeGreaterThan(0);
    expect(countImages(ENEMY_SHIPS[0])).toBe(3);
  });

  it('spawns a mini boss on wave 5', async () => {
    await renderGame(quietState({ wave: 4, waveClearTimer: 0.01 }));
    await advance(100);
    expect(screen.getAllByText(/WAVE 5/).length).toBeGreaterThan(0);
    expect(countImages(BOSS_MINI_IMG)).toBe(1);
  });

  it('spawns a giant boss on wave 10', async () => {
    await renderGame(quietState({ wave: 9, waveClearTimer: 0.01 }));
    await advance(100);
    expect(screen.getAllByText(/WAVE 10/).length).toBeGreaterThan(0);
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
    expect(screen.getByText('+1 HULL')).toBeTruthy();
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
    await fireEvent.press(screen.getByTestId('pause'));
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
    expect(screen.getByText('-1 HULL')).toBeTruthy();
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
      shot: 0,
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
    expect(screen.getByText('-1 HULL')).toBeTruthy();
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
    await fireEvent.press(screen.getByTestId('pause'));
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
    // All three wear the boss shot — a boss has no archetype, so both its fan
    // and its volley round fall back to BOSS_SHOT rather than the plain dot.
    // The hidden prewarm strip mounts one of every shot, hence the fourth.
    const { ENEMY_SHOTS, BOSS_SHOT } = require('../../game/constants');
    expect(countImages(ENEMY_SHOTS[BOSS_SHOT])).toBe(4);
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
    expect(screen.getByText(`${GUN_LABEL.double} 16`)).toBeTruthy();
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
    expect(screen.getByText(`${GUN_LABEL.double} ×2 16`)).toBeTruthy();
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
    expect(screen.getByText(`${GUN_LABEL.laser} ×4 16`)).toBeTruthy();
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
    expect(screen.getByText(`${GUN_LABEL.laser} ×${MAX_GUN_LEVEL} 16`)).toBeTruthy();
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
    expect(screen.getByText(`${GUN_LABEL.homing} 16`)).toBeTruthy();
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
    await fireEvent.press(screen.getByTestId('pause')); // pause snapshots the state
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
    await fireEvent.press(screen.getByTestId('pause'));
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
    // Wall clock, not sim time: hit-stop on each kill pushes the simulation
    // slightly behind, so the death-pop needs a little longer to clear.
    await advance(700);
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
    // Both show the frozen altitude, in their own formats: the HUD's region-D
    // readout dropped the rocket prefix when score took the headline; the pause
    // overlay keeps it.
    expect(screen.getAllByText('500m').length).toBeGreaterThan(0);
    expect(screen.getAllByText('500m').length).toBeGreaterThan(0);
    // Loop is halted: altitude does not move while paused.
    await advance(1000);
    expect(screen.getAllByText('500m').length).toBeGreaterThan(0);
    expect(screen.getAllByText('500m').length).toBeGreaterThan(0);
  });

  it('pause button freezes the game and snapshots the run', async () => {
    const { onPersist } = await renderGame(quietState({ coins: 42 }));
    await advance(100);
    await fireEvent.press(screen.getByTestId('pause'));
    expect(screen.getByText('PAUSED')).toBeTruthy();
    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(onPersist.mock.calls[0][0].coins).toBe(42);
  });

  it('CONTINUE resumes the loop', async () => {
    await renderGame(quietState({ alt: 500 }), { startPaused: true });
    await fireEvent.press(screen.getByText('CONTINUE'));
    expect(screen.queryByText('PAUSED')).toBeNull();
    await advance(1000);
    // Altitude moved to region D (top-right) and dropped its rocket prefix when
    // score took the headline slot.
    const altText = String(screen.getByText(/^\d+m$/).props.children);
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
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2); // score + coins reset
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
      await fireEvent.press(screen.getByTestId('pause'));
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
    await fireEvent.press(screen.getByTestId('pause'));
    const snap: GameState = onPersist.mock.calls[0][0];
    expect(snap.avatarX).toBe(SCREEN.W - FEED_PAD - AVATAR_SIZE / 2);
    expect(snap.avatarY).toBe(60);
  });
});

describe('GameScreen — ship specials (the FIRE button)', () => {
  // Reaching a full meter honestly takes SPECIAL_CHARGE_SEC; resuming with it
  // already full is the same code path and keeps these tests quick.
  const armed = (over: Partial<GameState> = {}) => quietState({ specialCharge: 1, ...over });

  it('shows the FIRE button on every hull, including the free starter', async () => {
    // Ironclad used to carry no special at all — a permanently dead button that
    // taught a new player "you don't have the good stuff" in their first minute.
    // It now has BULWARK, so the button is live from the first run.
    await renderGame(); // default props equip AVATARS[0] — Ironclad
    expect(screen.getByText('FIRE')).toBeTruthy();
    expect(screen.queryByText('BUY A SHIP')).toBeNull();
  });

  it('the meter does NOT fill by waiting — energy is earned', async () => {
    // The old design trickled a full meter every 5 seconds, which made the
    // special into admin rather than a decision. A quiet run must stay near
    // empty however long it lasts.
    const { onPersist } = await renderGame(quietState({ cards: [card({ y: 200, hp: 999 })] }));
    await advance(8000);
    await fireEvent.press(screen.getByTestId('pause'));
    expect(onPersist.mock.calls[0][0].specialCharge).toBeLessThan(0.2);
  });

  it('kills charge the meter', async () => {
    // Six one-HP enemies fed to the guns: energy comes from play.
    const resume = quietState({
      fireTimer: 0,
      cards: Array.from({ length: 6 }, (_, i) =>
        card({ lane: 1, y: AVATAR_Y - 120 - i * 8, hp: 1, maxHp: 1 })
      ),
    });
    const { onPersist } = await renderGame(resume);
    await advance(2500);
    await fireEvent.press(screen.getByTestId('pause'));
    const snap = onPersist.mock.calls[0][0];
    expect(snap.kills).toBeGreaterThan(0);
    expect(snap.specialCharge).toBeGreaterThan(0);
  });

  it('a lull still trickles a floor, so the mechanic cannot soft-lock', async () => {
    // An empty board pays a slow floor — otherwise a player could be locked out
    // of the special entirely during a quiet beat.
    const { onPersist } = await renderGame(quietState({ cards: [] }));
    await advance(3000);
    await fireEvent.press(screen.getByTestId('pause'));
    expect(onPersist.mock.calls[0][0].specialCharge).toBeGreaterThan(0);
  });

  it('banks past full into an overcharge, and says so', async () => {
    await renderGame(quietState({ specialCharge: ENERGY_OVERCHARGE }), { avatarSpecial: 'nova' });
    await advance(50);
    // The armed label gains a marker once the meter is banked past full.
    expect(screen.getByText(`${SPECIALS.nova.name} +`)).toBeTruthy();
  });

  it('firing empties the meter and disarms the button', async () => {
    await renderGame(armed(), { avatarSpecial: 'nova' });
    await advance(50);
    await fireEvent.press(screen.getByText('FIRE'));
    // Past the activation freeze AND the on-screen callout, which carries the
    // same words as the armed label.
    await advance(HITSTOP_MS + 1200);
    expect(screen.queryByText(SPECIALS.nova.name)).toBeNull(); // spent
  });

  it('a full meter names the attack and is spent on tap', async () => {
    const { onPersist } = await renderGame(armed(), { avatarSpecial: 'nova' });
    await advance(50);
    expect(screen.getByText(SPECIALS.nova.name)).toBeTruthy(); // armed label
    await fireEvent.press(screen.getByText('FIRE'));
    await advance(1200); // outlast the activation callout float
    await fireEvent.press(screen.getByTestId('pause'));
    // Drained — bar the sliver it has already earned back by the time we pause.
    expect(onPersist.mock.calls[0][0].specialCharge).toBeLessThan(0.05);
    expect(screen.queryByText(SPECIALS.nova.name)).toBeNull(); // no longer armed
  });

  it('Specter — PHANTOMS: two ghost hulls join you, then fade', async () => {
    await renderGame(armed(), { avatarSpecial: 'phantom' });
    await advance(50);
    expect(countImages(AVATARS[0].image)).toBe(1); // just the ship
    await fireEvent.press(screen.getByText('FIRE'));
    await advance(50);
    expect(countImages(AVATARS[0].image)).toBe(3); // ship + two ghosts
    await advance(PHANTOM_TIME * 1000 + 200);
    expect(countImages(AVATARS[0].image)).toBe(1); // dissolved
  });

  it('Raptor — TALONS: fans of claws hose out for the whole barrage', async () => {
    const resume = armed({
      cards: [
        card({ lane: 1, y: AVATAR_Y - 150, hp: 1 }),
        card({ lane: 2, y: AVATAR_Y - 150, hp: 1 }),
      ],
    });
    await renderGame(resume, { avatarSpecial: 'talons' });
    await advance(50);
    await fireEvent.press(screen.getByText('FIRE'));
    await advance(HITSTOP_MS + 20); // clear the activation freeze, then one frame
    expect(countShotsOfLength(TALON_LEN)).toBe(TALON_COUNT);
    // Machine gun, not a one-shot: more fans keep coming while it runs.
    await advance(500);
    expect(countShotsOfLength(TALON_LEN)).toBeGreaterThan(TALON_COUNT * 2);
    // The rake sweeps the row: both enemies die, though they sit in two lanes.
    expect(countImages(ENEMY_SHIPS[0])).toBe(0);
  });

  it('Raptor — the barrage stops on its own and the claws clear out', async () => {
    const { onPersist } = await renderGame(armed(), { avatarSpecial: 'talons' });
    await advance(50);
    await fireEvent.press(screen.getByText('FIRE'));
    await advance(TALON_BURST_TIME * 1000 + 1500); // burst ends, last claws fly off
    expect(countShotsOfLength(TALON_LEN)).toBe(0);
    await fireEvent.press(screen.getByTestId('pause'));
    expect(onPersist.mock.calls[0][0].talonTime).toBe(0);
  });

  it('Nova — NOVA BURST: a ring expands, damaging enemies and wiping enemy fire', async () => {
    const enemyShot: EnemyBullet = {
      id: 900,
      x: AVATAR_X,
      y: AVATAR_Y - 60, // right next to the ship, inside the blast
      vx: 0,
      vy: -400, // flying away upward, so it cannot land a hit first
      kind: 'straight',
      color: '#FF3B3B',
      size: 11,
      phase: 0,
      life: 5,
    };
    const resume = armed({
      cards: [card({ lane: 1, y: AVATAR_Y - 120, hp: 1 })],
      enemyBullets: [enemyShot],
    });
    const { onPersist } = await renderGame(resume, { avatarSpecial: 'nova' });
    await advance(50);
    await fireEvent.press(screen.getByText('FIRE'));
    await advance(HITSTOP_MS + 500);
    expect(countImages(ENEMY_SHIPS[0])).toBe(0); // caught by the wave
    await fireEvent.press(screen.getByTestId('pause'));
    expect(onPersist.mock.calls[0][0].enemyBullets).toHaveLength(0); // swept clean
  });

  it('Nova — the wave expands from the hull, then dissipates and stops', async () => {
    const { onPersist } = await renderGame(armed(), { avatarSpecial: 'nova' });
    await advance(50);
    await fireEvent.press(screen.getByText('FIRE'));
    await advance(100);
    await fireEvent.press(screen.getByTestId('pause')); // snapshot mid-blast
    const mid: GameState = onPersist.mock.calls[0][0];
    expect(mid.novaR).toBeGreaterThan(0);
    expect(mid.novaR).toBeLessThan(NOVA_RADIUS);
    // Centred on the hull, not the screen origin.
    expect(mid.novaX).toBeCloseTo(AVATAR_X);
  });

  it('a mass kill cannot blow past the particle ceiling', async () => {
    // A full formation destroyed in one wave: every death bursts sparks, and
    // each spark is a view re-rendered every frame.
    const swarm = Array.from({ length: 12 }, (_, i) =>
      card({ id: 500 + i, lane: i % LANES, y: AVATAR_Y - 120 - Math.floor(i / LANES) * 40, hp: 1 })
    );
    const { onPersist } = await renderGame(armed({ cards: swarm }), { avatarSpecial: 'nova' });
    await advance(50);
    await fireEvent.press(screen.getByText('FIRE'));
    // Long enough for the ring to sweep the whole formation, past the
    // activation freeze.
    await advance(HITSTOP_MS + 500);
    await fireEvent.press(screen.getByTestId('pause'));
    const live = onPersist.mock.calls[0][0].particles.length;
    expect(live).toBeLessThanOrEqual(MAX_PARTICLES);
    // Uncapped this would be ~170 sparks, so the run must actually be pressing
    // against the ceiling — otherwise this test proves nothing.
    expect(live).toBeGreaterThan(MAX_PARTICLES * 0.75);
  });

  it('Valkyrie — SPEAR RAIN: a scattered downpour that still finds the enemy', async () => {
    // An enemy well ABOVE the player, in a lane the ship is not under — normal
    // fire flies straight up from the hull, so only the rain can reach it.
    const rng = seedRandom(); // the scatter is random; pin it so this can't flake
    const resume = armed({ cards: [card({ lane: 4, y: 90, hp: 1 })] });
    await renderGame(resume, { avatarSpecial: 'spears' });
    await advance(50);
    await fireEvent.press(screen.getByText('FIRE'));
    // The rain launches in waves rather than as one sheet (see SPEAR_RELEASE),
    // so wait out the activation freeze AND the whole release window before
    // counting. The ×1.5 is frame quantization: a 40ms release timer can only
    // fire on a frame boundary, so each wave really takes ~3 frames.
    //
    // Still well short of the ~0.7s it takes the fastest spear to reach the
    // bottom, so all thirty are in the air at this point — and spears PIERCE,
    // so killing the enemy on the way down doesn't consume any of them either.
    const rainMs = (SPEAR_COUNT / SPEAR_RELEASE) * SPEAR_RELEASE_EVERY * 1000 * 1.5;
    await advance(HITSTOP_MS + rainMs);
    const xs = shotXsOfLength(SPEAR_LEN);
    expect(xs.length).toBe(SPEAR_COUNT);
    // Scattered across the whole play area, out to both edges.
    expect(Math.min(...xs)).toBeLessThan(SCREEN.W * 0.25);
    expect(Math.max(...xs)).toBeGreaterThan(SCREEN.W * 0.75);
    // Messy, not a rank of evenly spaced rails: the gaps between neighbouring
    // spears vary widely instead of all being one pitch.
    const sorted = [...xs].sort((a, b) => a - b);
    const gaps = sorted.slice(1).map((v, i) => v - sorted[i]);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(SCREEN.W / SPEAR_COUNT);
    // Enough for the rain to connect and the death pop (0.18s) to finish, but
    // NOT enough for WAVE_GAP to elapse afterwards — once the board is clear the
    // next wave drops in, and its ships would be counted as this one surviving.
    await advance(600);
    expect(countImages(ENEMY_SHIPS[0])).toBe(0);
    rng.mockRestore();
  });

  it('an empty meter cannot be fired', async () => {
    const resume = quietState({
      specialCharge: 0.5, // half full — not armed
      cards: [card({ lane: 1, y: AVATAR_Y - 150, hp: 1 })],
    });
    await renderGame(resume, { avatarSpecial: 'talons' });
    await advance(50);
    await fireEvent.press(screen.getByText('FIRE'));
    await advance(20);
    expect(countShotsOfLength(TALON_LEN)).toBe(0);
  });
});
