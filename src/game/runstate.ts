// The canonical initial run state.
//
// Lives in the game-logic layer rather than inside GameScreen because three
// callers need it and only one of them is the renderer: the loop (a new run),
// the pause screen's NEW GAME, and the test suite, which crafts scenarios by
// spreading overrides onto a valid baseline instead of re-listing every field.
// That last point matters — a hand-written GameState literal in a test breaks
// every time the shape grows, which teaches people to stop adding fields.

import { GameState } from './types';
import { laneX, AVATAR_Y, HEART_EVERY, HEARTS_MAX, BOON_EVERY } from './constants';
import { ShipStats, BASE_SHIP_STATS } from './upgrades';

/**
 * A fresh run for the given hull.
 *
 * `stats` defaults to the un-upgraded block, so calling this with no argument
 * yields exactly the game's original starting state — which is what makes it a
 * safe baseline for tests.
 */
export function freshRunState(stats: ShipStats = BASE_SHIP_STATS): GameState {
  return {
    avatarX: laneX(1),
    avatarY: AVATAR_Y,
    targetX: laneX(1),
    targetY: AVATAR_Y,
    dragDX: 0,
    dragDY: 0,
    dragging: false,
    alt: 0,
    wave: 0,
    waveClearTimer: 0.8, // first wave drops in quickly
    gun: 'single',
    gunTime: 0,
    gunLevel: 1,
    fireTimer: 0.4,
    // The FIRE meter starts empty and is EARNED from kills and grazes.
    specialCharge: 0,
    bulwarkTime: 0,
    bulwarkLeft: 0,
    phantomTime: 0,
    talonTime: 0,
    talonTimer: 0,
    novaR: 0,
    novaX: 0,
    novaY: 0,
    novaHits: [],
    coinQueue: [],
    coinQueueT: 0,
    spearQueue: [],
    spearQueueT: 0,
    giftTimer: 8, // first gun drop comes early to teach the mechanic
    heartTimer: HEART_EVERY,
    coinTimer: 3, // first coin drops early so the currency is obvious
    boonTimer: BOON_EVERY * 0.6, // first utility drop comes early too
    enemyFireTimer: 2.5,
    bullets: [],
    enemyBullets: [],
    cards: [],
    particles: [],
    explosions: [],
    floats: [],
    elapsed: 0,
    distTimer: 0,
    // Hull Plating raises the launch total; the ceiling stays the global max
    // until an Extra Heart boon lifts it mid-run.
    hearts: stats.startHearts,
    maxHearts: HEARTS_MAX,
    coins: 0,
    shake: 0,
    hitFlash: 0,
    nextId: 1,
    boons: {},
    bombs: stats.bombCapacity,
    bombCap: stats.bombCapacity,
    bombFlash: 0,
    crystals: 0,
    chips: 0,
    alloy: 0,
    kills: 0,
    eliteKills: 0,
    miniBossKills: 0,
    giantBossKills: 0,
    damageDealt: 0,
    shotsFired: 0,
    shotsHit: 0,
    pickupsCollected: 0,
    heartsCollected: 0,
    bombsUsed: 0,
    specialsUsed: 0,
    hitsTaken: 0,
    perfectBosses: 0,
    bossDamageTaken: 0,
    waveHits: 0,
    flawlessWaves: 0,
    score: 0,
    chain: 0,
    chainT: 0,
    decayT: 0,
    bestMult: 1,
    grazes: 0,
    waveStartT: 0,
    waveChainHeld: true,
    hitStop: 0,
  };
}
