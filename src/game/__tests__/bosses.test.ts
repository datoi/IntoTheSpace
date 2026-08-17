import {
  BOSS_PHASES,
  BOSS_WINDUP,
  bossFire,
  bossPhase,
  bossPhaseCount,
  bossPhaseIndex,
  bossSway,
  bossSwayReach,
} from '../bosses';
import type { EnemyCtx, EnemyShotSpec } from '../enemies';
import type { Card } from '../types';
import {
  SCREEN,
  OB_HIT,
  ENEMY_BULLET_SPEED,
  BOSS_SHOT,
  BOSS_MINI_VIS,
  BOSS_GIANT_VIS,
  BOSS_SWAY_AMP,
} from '../constants';

const boss = (over: Partial<Card> = {}): Card => ({
  id: 1,
  kind: 'rage',
  lane: 1,
  y: 150,
  h: 82,
  emoji: '',
  hp: 100,
  maxHp: 100,
  hitT: 0,
  boss: 'mini',
  cx: SCREEN.W / 2,
  dead: false,
  deadT: 0,
  nearMissChecked: false,
  ...over,
});

const makeCtx = (over: Partial<EnemyCtx> = {}) => {
  const shots: EnemyShotSpec[] = [];
  const ctx: EnemyCtx = {
    dt: 1 / 60,
    elapsed: 0,
    playerX: SCREEN.W / 2,
    playerY: 600,
    wave: 10,
    worldSpeed: 0,
    fire: (s) => shots.push(s),
    ...over,
  };
  return { ctx, shots };
};

/** Run frames until the boss fires, or give up. Returns the shots of one volley. */
const fireOnce = (c: Card, ctx: EnemyCtx, shots: EnemyShotSpec[], maxSeconds = 12) => {
  const frames = Math.ceil(maxSeconds / ctx.dt);
  for (let i = 0; i < frames && shots.length === 0; i++) bossFire(c, ctx);
  return shots;
};

const angleOf = (s: EnemyShotSpec) => Math.atan2(s.vy, s.vx);
const speedOf = (s: EnemyShotSpec) => Math.hypot(s.vx, s.vy);

describe('boss phases', () => {
  it('gives the two bosses different repertoires, not the same fight twice', () => {
    const mini = BOSS_PHASES.mini.map((p) => p.attack);
    const giant = BOSS_PHASES.giant.map((p) => p.attack);
    // If the giant were just a longer mini, half the boss content would be
    // redundant — which is the exact failure the phase rework exists to fix.
    expect(giant).not.toEqual(mini);
    expect(new Set([...mini, ...giant]).size).toBeGreaterThan(2);
  });

  it('runs the giant through five different verbs', () => {
    // position → orbit → commit → predict → time. Each phase must ask something
    // a player could fail at independently of the others.
    expect(BOSS_PHASES.giant.map((p) => p.attack)).toEqual([
      'wall',
      'spiral',
      'aimedwall',
      'twin',
      'burst',
    ]);
    expect(bossPhaseCount('giant')).toBe(5);
    expect(bossPhaseCount('mini')).toBe(3);
  });

  it('never repeats an attack within one boss, so no phase is filler', () => {
    // The whole justification for the health being as large as it is.
    for (const kind of ['mini', 'giant'] as const) {
      const attacks = BOSS_PHASES[kind].map((p) => p.attack);
      expect(new Set(attacks).size).toBe(attacks.length);
    }
  });

  it('derives the phase from health, full HP first and the last phase at the end', () => {
    const g = (hp: number) => bossPhaseIndex(boss({ boss: 'giant', hp, maxHp: 100 }));
    // Five phases, so each owns a 20% band counting down from full.
    expect(g(100)).toBe(0);
    expect(g(90)).toBe(0);
    expect(g(70)).toBe(1);
    expect(g(50)).toBe(2);
    expect(g(30)).toBe(3);
    expect(g(10)).toBe(4);
    expect(g(1)).toBe(4);
    // Never out of range, even for states the loop should not produce.
    expect(g(0)).toBe(4);
    expect(g(999)).toBe(0);
  });

  it('survives a zeroed maxHp rather than dividing by it', () => {
    expect(() => bossPhaseIndex(boss({ hp: 0, maxHp: 0 }))).not.toThrow();
    expect(bossPhaseIndex(boss({ hp: 0, maxHp: 0 }))).toBeGreaterThanOrEqual(0);
  });

  it('moves wider and faster as it is worn down', () => {
    const first = BOSS_PHASES.giant[0];
    const last = BOSS_PHASES.giant[BOSS_PHASES.giant.length - 1];
    // The escalation has to be visible before the player reads the health bar.
    expect(last.swayMult).toBeGreaterThan(first.swayMult);
    expect(last.freqMult).toBeGreaterThan(first.freqMult);
  });

  it('sways around screen centre and stays on screen', () => {
    const c = boss();
    for (let i = 0; i < 200; i++) {
      const x = bossSway(c, 0.1);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(SCREEN.W);
    }
  });

  it('keeps the whole SPRITE on screen, not just its centre point', () => {
    // The test above checks the centre only, which is how a giant came to hang
    // ~53px off the edge at its widest phase while the suite stayed green. The
    // boss is drawn from `cx ± vis / 2`, so that span is what has to fit.
    for (const [kind, hp, maxHp] of [
      ['giant', 120, 120],
      ['giant', 70, 120],
      ['giant', 20, 120],
      ['mini', 45, 45],
      ['mini', 10, 45],
    ] as const) {
      const c = boss({ boss: kind, hp, maxHp });
      const half = (kind === 'giant' ? BOSS_GIANT_VIS : BOSS_MINI_VIS) / 2;
      // Long enough for the eased width to reach its target and sweep full arcs.
      for (let i = 0; i < 1200; i++) {
        const x = bossSway(c, 1 / 60);
        expect(x - half).toBeGreaterThanOrEqual(0);
        expect(x + half).toBeLessThanOrEqual(SCREEN.W);
      }
    }
  });

  it('narrows the arc rather than flattening it against the edge', () => {
    const lastMult = BOSS_PHASES.giant[BOSS_PHASES.giant.length - 1].swayMult;
    // Precondition: the widest phase really is being capped on this screen, or
    // the assertion below would pass for want of anything to clamp.
    expect(bossSwayReach('giant', lastMult)).toBeLessThan(SCREEN.W * BOSS_SWAY_AMP * lastMult);

    const c = boss({ boss: 'giant', hp: 20, maxHp: 120 });
    const xs: number[] = [];
    for (let i = 0; i < 1200; i++) xs.push(bossSway(c, 1 / 60));

    // Clamping the POSITION parks the boss: consecutive frames land on exactly
    // the same value while the underlying sine runs past the limit, and its
    // velocity snaps to zero and back. Capping the AMPLITUDE keeps a true sine,
    // which passes through its peak and never repeats a position.
    let longest = 1;
    let run = 1;
    for (let i = 1; i < xs.length; i++) {
      run = Math.abs(xs[i] - xs[i - 1]) < 1e-9 ? run + 1 : 1;
      longest = Math.max(longest, run);
    }
    expect(longest).toBe(1);
  });

  it('starts at centre so a boss does not snap sideways when it lands', () => {
    // The sine's phase starts at zero, so the first frame of sway sits at
    // centre rather than wherever run time happened to have carried it.
    expect(bossSway(boss(), 0)).toBeCloseTo(SCREEN.W / 2, 6);
  });

  /**
   * The regression this module's history turns on.
   *
   * Sway used to be `sin(elapsed × FREQ × phase.freqMult)`. Crossing a phase
   * band changed `freqMult`, which jumped the sine's argument by `t × Δmult` —
   * a discontinuity that GREW with fight length. Measured before the fix: up to
   * 79% of screen width in a single frame, four times per giant fight. It read
   * in-game as the boss vanishing and reappearing on the other side.
   *
   * Nothing in the suite caught it, because every sway test sampled at a FIXED
   * health — so `freqMult` never changed during a sampled sweep. The bug lived
   * exactly in the transition none of them crossed.
   */
  it('never jumps when health crosses a phase boundary', () => {
    const dt = 1 / 60;
    for (const kind of ['mini', 'giant'] as const) {
      const maxHp = 120;
      const c = boss({ boss: kind, hp: maxHp, maxHp });
      let prev = bossSway(c, dt);
      let worst = 0;
      // Wear it down at a steady rate through every band it has.
      while (c.hp > 0) {
        c.hp -= 3 * dt;
        const x = bossSway(c, dt);
        worst = Math.max(worst, Math.abs(x - prev));
        prev = x;
      }
      // A sway moving at its fastest covers a few px per frame. Anything near a
      // screen width is a teleport, not movement.
      expect(worst).toBeLessThan(SCREEN.W * 0.02);
    }
  });

  it('still widens and quickens once the new phase settles', () => {
    // Continuity must not have flattened the escalation into nothing: a boss in
    // its last phase has to end up visibly wider than one at full health.
    const spread = (hp: number) => {
      const c = boss({ boss: 'giant', hp, maxHp: 120 });
      let lo = Infinity;
      let hi = -Infinity;
      // Long enough for the eased width to reach its target and sweep a full arc.
      for (let i = 0; i < 1200; i++) {
        const x = bossSway(c, 1 / 60);
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
      return hi - lo;
    };
    expect(spread(20)).toBeGreaterThan(spread(120));
  });
});

describe('boss attack patterns', () => {
  it('opens with an aimed fan that actually points at the player', () => {
    const c = boss();
    const { ctx, shots } = makeCtx({ playerX: 60, playerY: 700 });
    fireOnce(c, ctx, shots);
    expect(shots).toHaveLength(3);
    const toPlayer = Math.atan2(700 - (c.y + c.h), 60 - c.cx!);
    // The centre shot is the aim line; the outer two bracket it.
    const angles = shots.map(angleOf).sort((a, b) => a - b);
    expect(angles[1]).toBeCloseTo(toPlayer, 5);
    expect(angles[0]).toBeLessThan(toPlayer);
    expect(angles[2]).toBeGreaterThan(toPlayer);
  });

  it('wears the boss shot art on every shot it fires', () => {
    const c = boss();
    const { ctx, shots } = makeCtx();
    fireOnce(c, ctx, shots);
    for (const s of shots) expect(s.shot).toBe(BOSS_SHOT);
  });

  it('rakes a sweep that moves between volleys instead of repeating', () => {
    const c = boss({ hp: 50, maxHp: 100 }); // the mini's middle phase is `rake`
    expect(bossPhase(c).attack).toBe('rake');
    const { ctx, shots } = makeCtx();

    fireOnce(c, ctx, shots);
    const first = angleOf(shots[Math.floor(shots.length / 2)]);
    shots.length = 0;
    fireOnce(c, ctx, shots);
    const second = angleOf(shots[Math.floor(shots.length / 2)]);

    // A sweep that fired the same heading twice would just be a fan.
    expect(second).not.toBeCloseTo(first, 3);
  });

  it('always leaves exactly one gap in a wall, and never against an edge', () => {
    const c = boss({ boss: 'giant', hp: 100, maxHp: 100 });
    expect(bossPhase(c).attack).toBe('wall');
    const colW = SCREEN.W / 9;

    // Random gap placement, so this is checked over many volleys.
    for (let run = 0; run < 60; run++) {
      const { ctx, shots } = makeCtx();
      c.fireT = undefined;
      fireOnce(c, ctx, shots);

      expect(shots).toHaveLength(8); // 9 columns minus the one gap
      const columns = shots.map((s) => Math.round(s.x / colW - 0.5));
      expect(new Set(columns).size).toBe(8); // no column fired twice
      const missing = [...Array(9).keys()].filter((i) => !columns.includes(i));
      expect(missing).toHaveLength(1);
      // A gap in the outermost column forces the player into the corner the
      // hull manoeuvres out of worst.
      expect(missing[0]).toBeGreaterThanOrEqual(1);
      expect(missing[0]).toBeLessThanOrEqual(7);

      // The curtain must be readable, so it travels slower than normal fire.
      for (const s of shots) {
        expect(s.vx).toBeCloseTo(0, 6);
        expect(s.vy).toBeGreaterThan(0);
        expect(speedOf(s)).toBeLessThan(ENEMY_BULLET_SPEED);
      }
    }
  });

  it('does not waste the projectile ceiling on spiral arms flying off the top', () => {
    const c = boss({ boss: 'giant', hp: 70, maxHp: 100 });
    expect(bossPhase(c).attack).toBe('spiral');
    for (let run = 0; run < 25; run++) {
      const { ctx, shots } = makeCtx();
      c.fireT = undefined;
      fireOnce(c, ctx, shots);
      expect(shots.length).toBeGreaterThan(0);
      for (const s of shots) {
        // Steeply upward shots leave the screen before the player could ever
        // interact with them.
        expect(s.vy / speedOf(s)).toBeGreaterThanOrEqual(-0.35);
      }
    }
  });

  it('opens an aimed wall away from the player, never on top of them', () => {
    const c = boss({ boss: 'giant', hp: 50, maxHp: 100 });
    expect(bossPhase(c).attack).toBe('aimedwall');
    const colW = SCREEN.W / 9;

    // Swept across the board: wherever the player stands, the hole must cost
    // them a move. A wall that could open under a stationary player would make
    // the phase a coin-flip instead of a test.
    for (const playerX of [10, SCREEN.W * 0.25, SCREEN.W / 2, SCREEN.W * 0.75, SCREEN.W - 10]) {
      for (let run = 0; run < 12; run++) {
        const { ctx, shots } = makeCtx({ playerX });
        c.fireT = undefined;
        fireOnce(c, ctx, shots);

        expect(shots).toHaveLength(8);
        const columns = shots.map((s) => Math.round(s.x / colW - 0.5));
        const gap = [...Array(9).keys()].filter((i) => !columns.includes(i))[0];
        const playerCol = Math.floor(playerX / colW);
        expect(gap).not.toBe(playerCol);
        // …and still never jammed against an edge.
        expect(gap).toBeGreaterThanOrEqual(1);
        expect(gap).toBeLessThanOrEqual(7);
      }
    }
  });

  it('lashes a tacking spread, not another straight fan', () => {
    const c = boss({ hp: 10, maxHp: 100 }); // the mini's last phase
    expect(bossPhase(c).attack).toBe('lash');
    const { ctx, shots } = makeCtx();
    fireOnce(c, ctx, shots);

    expect(shots).toHaveLength(5);
    // The zigzag physics are what make this read differently from a fan; fired
    // as 'straight' it would just be a wider fan.
    for (const s of shots) expect(s.kind).toBe('zigzag');
  });

  it('fires the twin wheels from two muzzles, spinning opposite ways', () => {
    const c = boss({ boss: 'giant', hp: 30, maxHp: 100, w: 132 });
    expect(bossPhase(c).attack).toBe('twin');
    const { ctx, shots } = makeCtx();
    fireOnce(c, ctx, shots);

    // Two muzzles, so shots leave from two distinct x positions either side of
    // the hull rather than all from its centre.
    const xs = new Set(shots.map((s) => Math.round(s.x)));
    expect(xs.size).toBe(2);
    const [left, right] = [...xs].sort((a, b) => a - b);
    expect(left).toBeLessThan(c.cx!);
    expect(right).toBeGreaterThan(c.cx!);

    // Counter-rotation, stated as the thing it actually buys: at any instant
    // the two wheels are pointing somewhere different, so they weave a lattice
    // instead of firing as one doubled wheel. Asserted on the HEADING SETS
    // rather than on a rotation direction — atan2 wraps, and the upward cull
    // changes which arms survive, so tracking "the" angle across volleys is not
    // a stable measurement.
    const headings = (side: -1 | 1) =>
      shots
        .filter((s) => (side < 0 ? s.x < c.cx! : s.x > c.cx!))
        .map((s) => angleOf(s).toFixed(3))
        .sort();
    expect(headings(-1)).not.toEqual(headings(1));

    // And the whole thing turns between volleys.
    const before = c.spiralA!;
    shots.length = 0;
    fireOnce(c, ctx, shots);
    expect(c.spiralA!).toBeGreaterThan(before);
  });

  it('rotates the spiral so it reads as a pinwheel', () => {
    const c = boss({ boss: 'giant', hp: 70, maxHp: 100 });
    const { ctx, shots } = makeCtx();
    fireOnce(c, ctx, shots);
    const a1 = c.spiralA;
    shots.length = 0;
    fireOnce(c, ctx, shots);
    expect(c.spiralA).toBeGreaterThan(a1!);
  });
});

describe('the burst telegraph', () => {
  const finalPhaseGiant = () => boss({ boss: 'giant', hp: 10, maxHp: 100 });

  it('shows the wind-up ring before it fires, never after', () => {
    const c = finalPhaseGiant();
    expect(bossPhase(c).attack).toBe('burst');
    const { ctx, shots } = makeCtx();

    // Run to the moment the weapon comes up.
    for (let i = 0; i < 600 && !c.windup; i++) bossFire(c, ctx);
    expect(c.windup).toBeCloseTo(BOSS_WINDUP, 5);
    // The tell must precede the shot — this is the whole contract.
    expect(shots).toHaveLength(0);

    // And it must resolve into a real salvo.
    for (let i = 0; i < 600 && shots.length === 0; i++) bossFire(c, ctx);
    expect(shots).toHaveLength(7);
    expect(c.windup).toBe(0);
  });

  it('fires the salvo the ring promised even if the phase changed under it', () => {
    // A telegraph that fizzles teaches the player the tell cannot be trusted,
    // which is worse than the shot itself.
    const c = finalPhaseGiant();
    const { ctx, shots } = makeCtx();
    for (let i = 0; i < 600 && !c.windup; i++) bossFire(c, ctx);
    expect(c.windup).toBeGreaterThan(0);

    c.hp = c.maxHp; // healed back into phase 1 mid-wind-up
    for (let i = 0; i < 600 && shots.length === 0; i++) bossFire(c, ctx);
    expect(shots).toHaveLength(7);
  });

  it('throws the salvo hard and tight, so it reads as one hammer blow', () => {
    const c = finalPhaseGiant();
    const { ctx, shots } = makeCtx({ playerX: 200, playerY: 700 });
    for (let i = 0; i < 1200 && shots.length === 0; i++) bossFire(c, ctx);

    for (const s of shots) expect(speedOf(s)).toBeGreaterThan(ENEMY_BULLET_SPEED);
    const angles = shots.map(angleOf);
    expect(Math.max(...angles) - Math.min(...angles)).toBeLessThan(1.1);
  });
});

describe('boss fire safety', () => {
  it('does nothing for a card that is not a boss', () => {
    const c = boss({ boss: undefined });
    const { ctx, shots } = makeCtx();
    for (let i = 0; i < 600; i++) bossFire(c, ctx);
    expect(shots).toHaveLength(0);
  });

  it('never fires on the very first frame it is called', () => {
    // The clock starts at the phase's full interval, so a boss cannot open by
    // shooting the frame it stops descending.
    const c = boss();
    const { ctx, shots } = makeCtx();
    bossFire(c, ctx);
    expect(shots).toHaveLength(0);
  });

  it('keeps every shot inside the play area it spawns from', () => {
    // One entry per phase of each boss, so every pattern is covered.
    for (const [kind, hp] of [
      ['mini', 100],
      ['mini', 50],
      ['mini', 10],
      ['giant', 100],
      ['giant', 70],
      ['giant', 50],
      ['giant', 30],
      ['giant', 10],
    ] as const) {
      const c = boss({ boss: kind, hp, maxHp: 100, h: 132, w: 132 });
      const { ctx, shots } = makeCtx();
      fireOnce(c, ctx, shots);
      for (const s of shots) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(SCREEN.W);
        expect(Number.isFinite(s.vx)).toBe(true);
        expect(Number.isFinite(s.vy)).toBe(true);
        expect(s.size).toBeGreaterThan(OB_HIT * 0.1);
      }
    }
  });
});
