import {
  SCREEN,
  LANES,
  FEED_PAD,
  LANE_W,
  laneX,
  shipForWave,
  SHIP_WAVES,
  ENEMY_SHIPS,
  enemyShotForShip,
  ENEMY_SHOTS,
  ENEMY_SHOT_ASPECT,
  BOSS_MINI_HP,
  BOSS_GIANT_HP,
  BG_SETS,
  AVATARS,
  GUN_LABEL,
  WAVE_COLORS,
  HEARTS_START,
  HEARTS_MAX,
  COIN_EVERY,
  HEART_EVERY,
  AVATAR_Y,
  AVATAR_SIZE,
} from '../constants';

describe('laneX', () => {
  it('centers lane 0 half a lane-width in from the left pad', () => {
    expect(laneX(0)).toBeCloseTo(FEED_PAD + LANE_W / 2);
  });

  it('centers the last lane half a lane-width in from the right pad', () => {
    expect(laneX(LANES - 1)).toBeCloseTo(SCREEN.W - FEED_PAD - LANE_W / 2);
  });

  it('spaces adjacent lanes exactly one lane-width apart', () => {
    for (let l = 1; l < LANES; l++) {
      expect(laneX(l) - laneX(l - 1)).toBeCloseTo(LANE_W);
    }
  });

  it('keeps every lane center inside the screen', () => {
    for (let l = 0; l < LANES; l++) {
      expect(laneX(l)).toBeGreaterThan(0);
      expect(laneX(l)).toBeLessThan(SCREEN.W);
    }
  });
});

describe('shipForWave', () => {
  it('uses the first ship for waves 1 through SHIP_WAVES', () => {
    expect(shipForWave(1)).toBe(0);
    expect(shipForWave(SHIP_WAVES)).toBe(0);
  });

  it('advances to the next ship on the wave after each tier boundary', () => {
    expect(shipForWave(SHIP_WAVES + 1)).toBe(1);
    expect(shipForWave(2 * SHIP_WAVES)).toBe(1);
    expect(shipForWave(2 * SHIP_WAVES + 1)).toBe(2);
  });

  it('clamps to the last ship for very deep waves', () => {
    expect(shipForWave(1000)).toBe(ENEMY_SHIPS.length - 1);
  });

  it('never returns an out-of-range index for any wave the game can produce', () => {
    for (let wave = 1; wave <= 200; wave++) {
      const idx = shipForWave(wave);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(ENEMY_SHIPS.length);
    }
  });

  it('stays in range even for invalid input (wave 0 / negative)', () => {
    for (const wave of [0, -1, -10]) {
      const idx = shipForWave(wave);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(ENEMY_SHIPS.length);
    }
  });
});

describe('enemyShotForShip', () => {
  it('maps each ship tier to a shot sprite index in range', () => {
    for (let s = 0; s < ENEMY_SHIPS.length; s++) {
      const idx = enemyShotForShip(s);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(ENEMY_SHOTS.length);
    }
  });

  it('cycles: the 6th ship tier reuses the first shot sprite', () => {
    expect(enemyShotForShip(ENEMY_SHOTS.length)).toBe(0);
  });

  it('handles negative ship indices without going out of range', () => {
    expect(enemyShotForShip(-1)).toBeGreaterThanOrEqual(0);
    expect(enemyShotForShip(-1)).toBeLessThan(ENEMY_SHOTS.length);
  });

  it('has one aspect ratio per shot sprite', () => {
    expect(ENEMY_SHOT_ASPECT).toHaveLength(ENEMY_SHOTS.length);
    for (const a of ENEMY_SHOT_ASPECT) {
      expect(a).toBeGreaterThan(0);
    }
  });
});

describe('boss HP formulas', () => {
  it('mini boss HP grows linearly with wave', () => {
    expect(BOSS_MINI_HP(5)).toBe(22 + 10);
    expect(BOSS_MINI_HP(15)).toBe(22 + 30);
    expect(BOSS_MINI_HP(15)).toBeGreaterThan(BOSS_MINI_HP(5));
  });

  it('giant boss HP grows linearly with wave and outpaces the mini', () => {
    expect(BOSS_GIANT_HP(10)).toBe(50 + 30);
    for (const w of [10, 20, 50]) {
      expect(BOSS_GIANT_HP(w)).toBeGreaterThan(BOSS_MINI_HP(w));
    }
  });
});

describe('game data integrity', () => {
  it('background sets all have positive-speed, positive-alpha layers', () => {
    expect(BG_SETS.length).toBeGreaterThan(0);
    for (const set of BG_SETS) {
      expect(set.layers.length).toBeGreaterThan(0);
      expect(set.aspect).toBeGreaterThan(0);
      for (const layer of set.layers) {
        expect(layer.speed).toBeGreaterThan(0);
        expect(layer.alpha).toBeGreaterThan(0);
        expect(layer.alpha).toBeLessThanOrEqual(1);
      }
    }
  });

  it('avatars have unique ids and exactly one free starter', () => {
    const ids = AVATARS.map((a) => a.id);
    expect(new Set(ids).size).toBe(AVATARS.length);
    const free = AVATARS.filter((a) => a.price === 0);
    expect(free).toHaveLength(1);
    expect(free[0].id).toBe('ironclad');
  });

  it('avatar prices are non-negative and sorted ascending (shop order)', () => {
    for (let i = 0; i < AVATARS.length; i++) {
      expect(AVATARS[i].price).toBeGreaterThanOrEqual(0);
      if (i > 0) expect(AVATARS[i].price).toBeGreaterThan(AVATARS[i - 1].price);
    }
  });

  it('every gift gun has a HUD label', () => {
    for (const gun of ['double', 'bomb', 'laser', 'homing']) {
      expect(GUN_LABEL[gun]).toBeTruthy();
    }
  });

  it('wave colors is a non-empty list of hex colors', () => {
    expect(WAVE_COLORS.length).toBeGreaterThan(0);
    for (const c of WAVE_COLORS) {
      expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('heart constants are sane', () => {
    expect(HEARTS_START).toBeGreaterThan(0);
    expect(HEARTS_MAX).toBeGreaterThanOrEqual(HEARTS_START);
  });

  it('pickups drop on positive intervals, coins more often than hearts', () => {
    expect(COIN_EVERY).toBeGreaterThan(0);
    expect(HEART_EVERY).toBeGreaterThan(0);
    expect(COIN_EVERY).toBeLessThan(HEART_EVERY); // coins are the common drop
  });

  it('the avatar flies in the lower part of the screen', () => {
    expect(AVATAR_Y).toBeGreaterThan(SCREEN.H / 2);
    expect(AVATAR_Y + AVATAR_SIZE).toBeLessThanOrEqual(SCREEN.H);
  });
});
