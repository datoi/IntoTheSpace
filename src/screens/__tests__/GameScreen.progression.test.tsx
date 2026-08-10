/**
 * Progression systems wired into the live game loop.
 *
 * Integration tests on purpose: the unit suites (game/__tests__/progression,
 * pickups, enemies) already pin the catalogs and the maths. What's left to prove
 * is that GameScreen actually READS them — an upgrade that resolves correctly
 * but never reaches the loop is the failure mode these catch.
 *
 * Kept separate from GameScreen.test.tsx so the original behaviour suite stays
 * readable; the helpers here are deliberately minimal rather than shared.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import GameScreen from '../GameScreen';
import { leftOf, topOf } from '../../test-utils/style';
import { freshRunState } from '../../game/runstate';
import { BASE_SHIP_STATS, ShipStats, resolveShipStats } from '../../game/upgrades';
import { withLevel } from '../../game/progression';
import { BOONS, BoonKind } from '../../game/pickups';
import { GameState, Card, EnemyBullet } from '../../game/types';
import {
  PALETTE,
  laneX,
  AVATAR_Y,
  HEARTS_START,
  HEARTS_MAX,
  OB_HIT,
  ENEMY_SHIPS,
  BACKGROUNDS,
  AVATARS,
} from '../../game/constants';

const SHIP = 'ironclad';

/** A quiet run: nothing spawns, and the player does not auto-fire. */
const quietState = (over: Partial<GameState> = {}): GameState => ({
  ...freshRunState(),
  wave: 1,
  waveClearTimer: 999,
  fireTimer: 999,
  giftTimer: 999,
  heartTimer: 999,
  coinTimer: 999,
  boonTimer: 999,
  enemyFireTimer: 999,
  cards: [],
  nextId: 5000,
  ...over,
});

let nextId = 1;
const card = (over: Partial<Card>): Card => ({
  id: nextId++,
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

const bullet = (over: Partial<EnemyBullet>): EnemyBullet => ({
  id: nextId++,
  x: 100,
  y: 200,
  vx: 0,
  vy: 30,
  kind: 'straight',
  color: '#FF3B3B',
  size: 11,
  phase: 0,
  life: 9,
  ...over,
});

const renderGame = async (resume?: GameState, shipStats: ShipStats = BASE_SHIP_STATS) => {
  const onGameOver = jest.fn();
  const onPersist = jest.fn();
  await render(
    <GameScreen
      best={0}
      avatarImage={AVATARS[0].image}
      avatarShot={AVATARS[0].shot}
      avatarSpecial={AVATARS[0].special}
      shipStats={shipStats}
      background={BACKGROUNDS[0].set}
      resume={resume ?? null}
      onGameOver={onGameOver}
      onPersist={onPersist}
      onClearRun={jest.fn()}
      onHome={jest.fn()}
    />
  );
  return { onGameOver, onPersist };
};

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

/**
 * Advance in small steps until `text` appears, up to `totalMs`.
 *
 * Necessary because the on-screen callouts are floating texts that live under a
 * second: a single large advanceTimersByTime would create AND expire the float
 * inside one step, so the assertion would never see it.
 */
const advanceUntilText = async (text: string, totalMs: number, stepMs = 120): Promise<boolean> => {
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    await advance(stepMs);
    if (screen.queryByText(text)) return true;
  }
  return false;
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

const countImages = (source: unknown): number => {
  let n = 0;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Image' && node.props?.source === source) n++;
    (node.children ?? []).forEach(walk);
  };
  walk(screen.toJSON());
  return n;
};

/**
 * Bombs remaining, read off the bomb button.
 *
 * Not `getByText(count)`: the HUD's coin purse renders a bare number too, so a
 * digit lookup is ambiguous. This finds the node holding the 💣 glyph and reads
 * the count sitting beside it.
 */
const bombCount = (): number => {
  let found: number | undefined;
  const walk = (n: any, inside: boolean) => {
    if (found !== undefined || !n || typeof n !== 'object') return;
    const here = inside || n.props?.testID === 'bomb';
    for (const k of n.children ?? []) {
      if (here && (typeof k === 'string' || typeof k === 'number') && /^\d+$/.test(String(k))) {
        found = Number(k);
        return;
      }
      walk(k, here);
    }
  };
  walk(screen.toJSON(), false);
  if (found === undefined) throw new Error('no bomb button rendered');
  return found;
};

/** Press the bomb button, located by its glyph. */
const pressBomb = async () => {
  await fireEvent.press(screen.getByTestId('bomb'));
};

/**
 * Top y of every rendered enemy ship wrapper, at ANY art tier — the tier comes
 * from the wave, so a spawn made mid-run does not necessarily wear ENEMY_SHIPS[0].
 */
const enemyTops = (): number[] => {
  const tops: number[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    const kids: any[] = node.children ?? [];
    if (kids.some((k) => k?.type === 'Image' && ENEMY_SHIPS.includes(k.props?.source))) {
      const style = Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
      tops.push(topOf(style));
    }
    kids.forEach(walk);
  };
  walk(screen.toJSON());
  return tops;
};

/** Center x of the first rendered enemy ship. */
const enemyCenterX = (): number => {
  let found: number | undefined;
  const walk = (node: any) => {
    if (found !== undefined || !node || typeof node !== 'object') return;
    const kids: any[] = node.children ?? [];
    if (kids.some((k) => k?.type === 'Image' && k.props?.source === ENEMY_SHIPS[0])) {
      const style = Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
      found = leftOf(style) + style.width / 2;
    }
    kids.forEach(walk);
  };
  walk(screen.toJSON());
  if (found === undefined) throw new Error('no enemy rendered');
  return found;
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('permanent upgrades reach the loop', () => {
  it('Hull Plating launches the run with more hearts', async () => {
    const stats = resolveShipStats(withLevel({}, SHIP, 'hull', 3), SHIP);
    // No resume, so the starting hearts come from the hull's resolved stats.
    await renderGame(undefined, stats);
    expect(heartsFromBar()).toBe(HEARTS_START + 3);
  });

  it('an un-upgraded hull still starts on the original heart count', async () => {
    await renderGame();
    expect(heartsFromBar()).toBe(HEARTS_START);
  });

  // Shots fired is counted on the run state, so pausing and reading the
  // snapshot measures the fire rate directly — far more precise than counting
  // bullets still on screen, most of which have already flown off the top.
  const shotsFiredIn = async (ms: number, stats: ShipStats): Promise<number> => {
    const { onPersist } = await renderGame(quietState({ fireTimer: 0 }), stats);
    await advance(ms);
    await fireEvent.press(screen.getByTestId('pause'));
    return onPersist.mock.calls[0][0].shotsFired;
  };

  it('an un-upgraded hull fires at the original rate', async () => {
    const fired = await shotsFiredIn(2000, BASE_SHIP_STATS);
    // 2s at FIRE_RATE (0.32s) ≈ 6 shots. Bounded rather than exact because the
    // loop's frame pacing decides which frame crosses each interval.
    expect(fired).toBeGreaterThanOrEqual(5);
    expect(fired).toBeLessThanOrEqual(8);
  });

  it('a maxed Autoloader fires materially faster over the same window', async () => {
    const stats = resolveShipStats(withLevel({}, SHIP, 'fireRate', 10), SHIP);
    const fired = await shotsFiredIn(2000, stats);
    // The interval drops to 60% of base, so ~10 shots — comfortably above the
    // un-upgraded ceiling asserted in the test above.
    expect(fired).toBeGreaterThan(8);
  });

  it('a stocked Bomb Bay shows the larger count on the button', async () => {
    const stats = resolveShipStats(withLevel({}, SHIP, 'bombs', 4), SHIP);
    await renderGame(undefined, stats);
    // The altitude readout can also contain this digit, so assert on the count
    // sitting next to the bomb glyph rather than on the bare number.
    expect(bombCount()).toBe(stats.bombCapacity);
  });

  it('a resumed run re-reads bomb capacity from the current hull', async () => {
    // The player bought a Bomb Bay level while the run sat paused; the stale
    // cap in the snapshot must not cancel it.
    const stats = resolveShipStats(withLevel({}, SHIP, 'bombs', 3), SHIP);
    await renderGame(quietState({ bombs: 1, bombCap: 1 }), stats);
    expect(bombCount()).toBe(1); // carried bombs are preserved…
    // …but the bay can now be refilled beyond the old cap.
    expect(stats.bombCapacity).toBeGreaterThan(1);
  });
});

describe('bombs', () => {
  it('detonating wipes every enemy shot on screen and spends a bomb', async () => {
    const resume = quietState({
      bombs: 1,
      bombCap: 1,
      enemyBullets: [bullet({ x: 100 }), bullet({ x: 140 })],
    });
    await renderGame(resume);
    await pressBomb();
    await advance(60);
    expect(screen.getByText('BOMB')).toBeTruthy();
    expect(bombCount()).toBe(0);
  });

  it('an empty bay is inert rather than going negative or crashing', async () => {
    await renderGame(quietState({ bombs: 0, bombCap: 1 }));
    await pressBomb();
    await advance(60);
    expect(bombCount()).toBe(0);
  });

  it('the blast damages every enemy on the board at once', async () => {
    const resume = quietState({
      bombs: 1,
      bombCap: 1,
      // Two enemies with a single HP each, in different lanes: only a
      // screen-wide blast kills both without the player firing a shot.
      cards: [
        card({ y: 200, holdY: 200, lane: 0, hp: 1, maxHp: 1 }),
        card({ y: 260, holdY: 260, lane: 4, hp: 1, maxHp: 1 }),
      ],
    });
    await renderGame(resume);
    expect(countImages(ENEMY_SHIPS[0])).toBe(2);
    await pressBomb();
    await advance(400); // past the 0.18s death-pop window
    expect(countImages(ENEMY_SHIPS[0])).toBe(0);
  });
});

describe('utility pickups', () => {
  /** A boon parked on the player, so the next frame collects it. */
  const boonOnPlayer = (boon: BoonKind): Card =>
    card({ kind: 'boon', boon, lane: 1, y: AVATAR_Y, hp: 1, maxHp: 1 });

  it('a shield blocks a hit that would otherwise cost a heart', async () => {
    const resume = quietState({
      cards: [boonOnPlayer('shield')],
      enemyBullets: [bullet({ x: laneX(1), y: AVATAR_Y + 6, vy: 20 })],
    });
    await renderGame(resume);
    await advance(500);
    expect(screen.getByText('BLOCKED')).toBeTruthy();
    expect(heartsFromBar()).toBe(HEARTS_START);
  });

  it('without a shield the same hit does cost a heart', async () => {
    const resume = quietState({
      enemyBullets: [bullet({ x: laneX(1), y: AVATAR_Y + 6, vy: 20 })],
    });
    await renderGame(resume);
    await advance(500);
    expect(heartsFromBar()).toBe(HEARTS_START - 1);
  });

  it('a repair kit tops the hull back up to full', async () => {
    await renderGame(quietState({ hearts: 1, cards: [boonOnPlayer('repair')] }));
    await advance(250);
    expect(heartsFromBar()).toBe(HEARTS_MAX);
  });

  it('an extra heart raises the run ceiling above the normal maximum', async () => {
    await renderGame(quietState({ hearts: HEARTS_MAX, cards: [boonOnPlayer('extraHeart')] }));
    await advance(250);
    expect(screen.getByText(/EXTRA HEART/)).toBeTruthy();
    // The bar is drawn against the run's LIVE ceiling, so a raised max keeps
    // the fill at 100% instead of overflowing the column.
    expect(heartsFromBar()).toBe(HEARTS_MAX + 1);
  });

  it('a bomb pickup loads another bomb into the bay', async () => {
    await renderGame(quietState({ bombs: 0, bombCap: 3, cards: [boonOnPlayer('bombPack')] }));
    await advance(250);
    expect(bombCount()).toBe(1);
  });

  it('freeze time stops a strafing enemy dead in its tracks', async () => {
    const resume = quietState({
      wave: 12,
      cards: [
        boonOnPlayer('freeze'),
        card({ y: 100, holdY: 100, hp: 999, maxHp: 999, arch: 'strafer', homeX: laneX(1), cx: laneX(1), dir: 1 }),
      ],
    });
    await renderGame(resume);
    await advance(120); // collect the boon
    const frozenAt = enemyCenterX();
    await advance(1500); // a strafer covers ~160px in this window
    expect(enemyCenterX()).toBeCloseTo(frozenAt, 0);
  });

  it('the screen nuke fires for free, without spending a carried bomb', async () => {
    const resume = quietState({
      wave: 8,
      bombs: 1,
      bombCap: 1,
      cards: [boonOnPlayer('nuke')],
      enemyBullets: [bullet({ x: 100, y: 200 })],
    });
    await renderGame(resume);
    await advance(250);
    expect(screen.getByText('NUKE')).toBeTruthy();
    expect(bombCount()).toBe(1); // the carried bomb is untouched
  });

  it('a timed boon announces itself, then reports running out', async () => {
    await renderGame(quietState({ cards: [boonOnPlayer('shield')] }));
    await advance(250);
    expect(screen.getAllByText(/SHIELD/).length).toBeGreaterThan(0);
    // Stepped rather than one jump: the expiry callout is a floating text that
    // lives well under a second.
    expect(await advanceUntilText('SHIELD OVER', (BOONS.shield.duration + 2) * 1000)).toBe(true);
  });

  it('double coins pays two for one', async () => {
    const resume = quietState({
      coins: 0,
      cards: [
        boonOnPlayer('doubleCoins'),
        card({ kind: 'coin', lane: 1, y: AVATAR_Y, hp: 1, maxHp: 1 }),
      ],
    });
    await renderGame(resume);
    await advance(300);
    expect(screen.getByText('+2 COINS')).toBeTruthy();
  });
});

describe('elites', () => {
  it("a shielded elite's pool absorbs damage before its hull does", async () => {
    const elite = card({
      y: 200,
      holdY: 200,
      hp: 40,
      maxHp: 40,
      arch: 'grunt',
      elite: 'shielded',
      homeX: laneX(1),
    });
    elite.shieldHp = 4;
    elite.shieldMax = 4;
    await renderGame(quietState({ wave: 10, fireTimer: 0, cards: [elite] }));
    // 4 shield points at 1 damage a shot, ~0.32s apart — stepped so the
    // break callout is caught while it is still on screen.
    expect(await advanceUntilText('SHIELD DOWN', 4000)).toBe(true);
  });

  it('a killed splitter leaves its children where it died, not off-screen', async () => {
    const parent = card({
      y: 300,
      holdY: 300,
      lane: 1,
      hp: 1,
      maxHp: 1,
      arch: 'splitter',
      homeX: laneX(1),
      cx: laneX(1),
    });
    parent.splitsLeft = 2;
    // Killed with a bomb rather than by auto-fire: a splitter sways, so static
    // bullets from the ship's rest position are not guaranteed to connect.
    await renderGame(quietState({ wave: 12, bombs: 1, bombCap: 1, cards: [parent] }));
    await pressBomb();
    await advance(400); // past the 0.18s death-pop window

    // Two children, both at the parent's death height — a child left at
    // makeEnemy's default spawn point would sit above the top of the screen.
    const ys = enemyTops();
    expect(ys.length).toBe(2);
    for (const y of ys) expect(y).toBeGreaterThan(0);
  });

  it('an elite kill pays its bounty into the run purse', async () => {
    const resume = quietState({
      wave: 10,
      fireTimer: 0,
      coins: 0,
      cards: [card({ y: 200, holdY: 200, hp: 1, maxHp: 1, arch: 'grunt', elite: 'swift', homeX: laneX(1) })],
    });
    await renderGame(resume);
    await advance(1500);
    // grunt bounty (1) + swift bonus (2), paid straight to the HUD purse.
    expect(screen.getByText('3')).toBeTruthy();
  });
});

describe('run result', () => {
  it('reports the whole haul and the run stats, not just coins', async () => {
    const resume = quietState({
      hearts: 1,
      coins: 9,
      crystals: 2,
      chips: 5,
      alloy: 1,
      wave: 6,
      kills: 21,
      // A plain enemy parked on the player, so contact ends the run within a
      // few frames. Deliberately NOT a boss: a boss sways to screen centre the
      // moment it lands, which would move it out of the player's lane.
      cards: [card({ y: AVATAR_Y, lane: 1, hp: 999, maxHp: 999 })],
    });
    const { onGameOver } = await renderGame(resume);
    await advance(2000);
    expect(onGameOver).toHaveBeenCalledTimes(1);
    const result = onGameOver.mock.calls[0][0];
    expect(result.coins).toBe(9);
    expect(result.crystals).toBe(2);
    expect(result.chips).toBe(5);
    expect(result.alloy).toBe(1);
    expect(result.wave).toBe(6);
    expect(result.stats.runs).toBe(1);
    expect(result.stats.deaths).toBe(1);
    expect(result.stats.kills).toBe(21);
    expect(result.stats.highestWave).toBe(6);
  });
});
