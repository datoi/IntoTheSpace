/**
 * The ambient sky behind every menu.
 *
 * These exist because of a crash report: switching background in the shop threw
 * "Cannot read property 'forEach' of null" out of React Native's Animated
 * internals. The cause was this component building `interpolate()` nodes during
 * RENDER against a natively-driven value — so every re-render (and App
 * re-renders on any save write) attached a fresh set of animated children and
 * detached the previous ones, while the native driver still held references.
 */
import React from 'react';
import { Animated } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { AmbientParallax, ParallaxBackground } from '../Parallax';
import { BACKGROUNDS, QUALITY_TIERS, BG_DIM, PALETTE } from '../../game/constants';

const countImages = (): number => {
  let n = 0;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Image') n++;
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

describe('AmbientParallax', () => {
  // Sets differ in shape — some carry a static base image and a planet field,
  // some do not — so each is its own mount path.
  it.each(BACKGROUNDS.map((b) => [b.id, b.set] as const))('mounts the %s sky', async (_id, set) => {
    await render(<AmbientParallax set={set} />);
    expect(countImages()).toBeGreaterThan(0);
  });

  it('survives switching between backgrounds', async () => {
    // The reported crash: change background, repeatedly, on a live component.
    await render(<AmbientParallax set={BACKGROUNDS[0].set} />);
    for (const bg of BACKGROUNDS) {
      await screen.rerender(<AmbientParallax set={bg.set} />);
      expect(countImages()).toBeGreaterThan(0);
    }
  });

  it('survives repeated re-renders with the SAME background', async () => {
    // App re-renders on every save write — a coin banked, an upgrade bought.
    // Each of those used to rebuild the whole animated node graph.
    await render(<AmbientParallax set={BACKGROUNDS[0].set} />);
    for (let i = 0; i < 12; i++) {
      await screen.rerender(<AmbientParallax set={BACKGROUNDS[0].set} dim={0.5 + i * 0.01} />);
    }
    expect(countImages()).toBeGreaterThan(0);
  });

  it('keeps drifting past a full cycle without tearing down', async () => {
    await render(<AmbientParallax set={BACKGROUNDS[0].set} />);
    jest.advanceTimersByTime(120_000); // past one wrap of the 90s loop
    expect(countImages()).toBeGreaterThan(0);
  });

  it('unmounts cleanly while the loop is still running', async () => {
    await render(<AmbientParallax set={BACKGROUNDS[0].set} />);
    jest.advanceTimersByTime(500);
    expect(() => screen.unmount()).not.toThrow();
  });

  it('does not stack its dim on top of the one baked into the art', async () => {
    // BG_DIM now lives in the background pixels rather than in a runtime scrim
    // (scripts/bake-bg-dim.mjs). The menu wants a deeper total darkness than
    // play does, so it applies only the RESIDUAL — applying its full intended
    // 0.55 over already-darkened art would land the menus far darker than they
    // shipped. This pins the composite, which is the thing that must not move.
    const MENU_DIM_TOTAL = 0.55;
    await render(<AmbientParallax set={BACKGROUNDS[0].set} />);
    let applied: number | undefined;
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      const st = Object.assign({}, ...[node.props?.style].flat(Infinity).filter(Boolean));
      if (st.backgroundColor === PALETTE.void && typeof st.opacity === 'number') {
        applied = st.opacity;
      }
      (node.children ?? []).forEach(walk);
    };
    walk(screen.toJSON());
    expect(applied).toBeDefined();
    // Baked dim, then the applied one on top, must come out at the intended total.
    const total = 1 - (1 - BG_DIM) * (1 - applied!);
    expect(total).toBeCloseTo(MENU_DIM_TOTAL, 5);
    expect(applied!).toBeLessThan(MENU_DIM_TOTAL); // i.e. it really did subtract
  });
});

/**
 * Adaptive quality reaching the sky.
 *
 * The background is the largest SUSTAINED cost in the game — a full-screen fill
 * per layer, every frame, whether the board is empty or carrying a boss. The
 * effect ceilings only ever cut spikes, so this is the part of the governor that
 * actually moves heat on a struggling device.
 */
describe('ParallaxBackground — quality tiers', () => {
  const set = BACKGROUNDS[0].set;
  const anims = set.layers.map(() => new Animated.Value(0));
  const mount = async (tier?: number) =>
    render(
      <ParallaxBackground set={set} anims={anims} planetAnim={new Animated.Value(0)} tier={tier} />
    );

  it('never draws more as the tier climbs, and bottoms out cheaper than full', async () => {
    // Deliberately not "strictly fewer at every step". Every set now ships a
    // SINGLE layer, so the sky itself has already bottomed out by tier 1 and
    // bgLayers has nothing left to trim — the remaining saving is the planet
    // field. What must hold is the direction and the endpoints.
    const counts: number[] = [];
    for (let t = 0; t < QUALITY_TIERS.length; t++) {
      await mount(t);
      counts.push(countImages());
    }
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
    expect(counts[counts.length - 1]).toBeLessThan(counts[0]); // the floor is cheaper
    expect(counts[counts.length - 1]).toBeGreaterThan(0); // …but never nothing
  });

  it('defaults to full detail, so the menus are untouched', async () => {
    // AmbientParallax has no loop measuring frames, so it must not inherit a
    // degraded sky by accident.
    await mount(undefined);
    const implicit = countImages();
    await mount(0);
    expect(implicit).toBe(countImages());
  });

  it('clamps a tier past the end of the table instead of blanking the sky', async () => {
    await mount(99);
    expect(countImages()).toBeGreaterThan(0);
  });
});
