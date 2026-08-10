import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { FloatTextView, HUD, HealthBar } from '../Effects';
import ParticleLayer from '../ParticleLayer';
import { leftOf } from '../../test-utils/style';
import { Particle, FloatText } from '../../game/types';
import { GUN_LABEL, HEARTS_MAX, MAX_PARTICLES, PALETTE } from '../../game/constants';

const particle: Particle = { id: 1, x: 10, y: 20, vx: 0, vy: 0, life: 0.5, color: '#FF0000', size: 6 };

const flatten = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('ParticleLayer', () => {
  const field = (n: number) => Array.from({ length: n }, (_, i) => ({ ...particle, id: i }));
  const slots = () => {
    let n = 0;
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'View') n++;
      (node.children ?? []).forEach(walk);
    };
    [screen.toJSON()].flat().forEach(walk);
    return n;
  };

  it('mounts the whole pool up front and never grows it', async () => {
    // The point of the layer: a fixed set of views paid for once, so a burst
    // costs style updates rather than mounts.
    await render(<ParticleLayer particles={[]} />);
    const idle = slots();
    expect(idle).toBe(MAX_PARTICLES);
    await render(<ParticleLayer particles={field(MAX_PARTICLES)} />);
    expect(slots()).toBe(idle);
  });

  it('survives more particles than it has slots', async () => {
    // MAX_PARTICLES is enforced by the spawner, but the layer must not be the
    // thing that breaks if that ever slips.
    await render(<ParticleLayer particles={field(MAX_PARTICLES * 2)} />);
    expect(slots()).toBe(MAX_PARTICLES);
  });

  it('retires slots without unmounting them when the field shrinks', async () => {
    await render(<ParticleLayer particles={field(20)} />);
    const full = slots();
    await render(<ParticleLayer particles={[]} />);
    expect(slots()).toBe(full);
  });

  it('places a live particle by transform, not by layout', async () => {
    // left/top would re-run layout on every spark every frame; a transform
    // does not. This is the whole reason the pool is affordable.
    await render(<ParticleLayer particles={[particle]} />);
    // The pool renders as a fragment, so toJSON() hands back one wrapper whose
    // children are the slots. Slot 0 is the only live one here.
    const root = screen.toJSON() as any;
    const style = flatten(root.children[0].props.style);
    expect(style.left).toBe(0);
    expect(style.top).toBe(0);
    expect(style.transform).toEqual([{ translateX: particle.x }, { translateY: particle.y }]);
    expect(style.backgroundColor).toBe(particle.color);
  });
});

describe('FloatTextView', () => {
  const floatText: FloatText = { id: 1, x: 100, y: 50, text: '+30', color: '#FFD32A', life: 0.8 };

  it('shows its text in its color', async () => {
    await render(<FloatTextView f={floatText} />);
    const node = screen.getByText('+30');
    expect(flatten(node.props.style).color).toBe('#FFD32A');
  });

  it('centers on x (the 120px-wide label is offset by -60)', async () => {
    await render(<FloatTextView f={floatText} />);
    expect(leftOf(flatten(screen.getByText('+30').props.style))).toBe(40);
  });
});

describe('HUD', () => {
  const base = {
    score: 0,
    coins: 7,
    alt: 1234.6,
    gun: 'single' as const,
    gunTime: 0,
    gunLevel: 1,
    multiplier: 1,
    chainFrac: 0,
  };

  /** The opacity the chain row is rendered at — it is ALWAYS mounted. */
  const chainOpacity = (): number | undefined => {
    const node = screen.getByText(/^×\d/);
    // The row is the Text's parent; walk the tree to find the wrapper holding it.
    let found: number | undefined;
    const walk = (n: any) => {
      if (!n || typeof n !== 'object') return;
      const kids: any[] = n.children ?? [];
      if (kids.some((k) => k?.type === 'Text' && (k.children ?? []).join('').startsWith('×'))) {
        found = flatten(n.props?.style ?? {}).opacity;
      }
      kids.forEach(walk);
    };
    walk(screen.toJSON());
    expect(node).toBeTruthy();
    return found;
  };

  it('headlines the SCORE, with altitude demoted to a depth readout', async () => {
    // Altitude used to be the headline, but a number that only counts seconds
    // elapsed cannot be a score. Both are shown; score leads.
    await render(<HUD boons={{}} {...base} score={12345} />);
    expect(screen.getByText('12,345')).toBeTruthy();
    expect(screen.getByText('1235m')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('never shows negative altitude', async () => {
    await render(<HUD boons={{}} {...base} alt={-5} />);
    expect(screen.getByText('0m')).toBeTruthy();
  });

  // --- The reflow fix -------------------------------------------------------
  // The chain row must be MOUNTED whether or not a chain is running, so nothing
  // below it moves when the player gets a second kill. It is hidden by opacity,
  // never by being conditionally rendered.
  it('keeps the chain row mounted at ×1, hidden by opacity', async () => {
    await render(<HUD boons={{}} {...base} />);
    expect(chainOpacity()).toBe(0);
  });

  it('reveals the same row once a chain is running', async () => {
    await render(<HUD boons={{}} {...base} multiplier={3} chainFrac={0.5} />);
    expect(screen.getByText('×3')).toBeTruthy();
    expect(chainOpacity()).toBe(1);
  });

  it('the gun chip is mounted even on the default shooter', async () => {
    // Same rule: mounting it conditionally would shove the boon chips around
    // every time a gun pickup expired. On 'single' there is no label, so the
    // chip renders a bare timer — which is a second '0' alongside the score.
    await render(<HUD boons={{}} {...base} />);
    expect(screen.getAllByText('0').length).toBe(2);
  });

  it('never announces a wave-clear ribbon over the play field', async () => {
    // The banner is gone by request — three gold slabs across the middle of the
    // board at the moment a new formation arrives. Ribbons are still SCORED
    // (see chain.test.ts); they just no longer interrupt the screen.
    await render(<HUD boons={{}} {...base} />);
    expect(screen.queryByText('FLAWLESS')).toBeNull();
    expect(screen.queryByText('FULL CHAIN')).toBeNull();
    expect(screen.queryByText('SPEED')).toBeNull();
  });

  it('shows a gun chip with its remaining seconds, rounded up', async () => {
    await render(<HUD boons={{}} {...base} gun="laser" gunTime={7.2} />);
    expect(screen.getByText(`${GUN_LABEL.laser} 8`)).toBeTruthy();
  });

  it('shows the stack multiplier when a gun is stacked', async () => {
    await render(<HUD boons={{}} {...base} gun="bomb" gunTime={3} gunLevel={3} />);
    expect(screen.getByText(`${GUN_LABEL.bomb} ×3 3`)).toBeTruthy();
  });

  it('never shows negative gun time', async () => {
    await render(<HUD boons={{}} {...base} gun="double" gunTime={-0.4} />);
    expect(screen.getByText(`${GUN_LABEL.double} 0`)).toBeTruthy();
  });

  it('shows a boon chip with its family rail', async () => {
    await render(<HUD boons={{ shield: 4 }} {...base} />);
    expect(screen.getByText('SHIELD 4')).toBeTruthy();
  });
});

describe('HealthBar', () => {
  // One segment per heart now, rather than a proportional fill. Count the filled
  // ones — being countable is the entire point of the change.
  const segs = (): { filled: number; total: number } => {
    let filled = 0;
    let total = 0;
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      const style = flatten(node.props?.style ?? {});
      if (style.width === 13 && style.height === 5) {
        total++;
        if (style.backgroundColor === PALETTE.threat) filled++;
      }
      (node.children ?? []).forEach(walk);
    };
    walk(screen.toJSON());
    return { filled, total };
  };

  it('draws one countable segment per heart', async () => {
    await render(<HealthBar hearts={4} />);
    expect(segs()).toEqual({ filled: 4, total: HEARTS_MAX });
  });

  it('is full at HEARTS_MAX', async () => {
    await render(<HealthBar hearts={HEARTS_MAX} />);
    expect(segs()).toEqual({ filled: HEARTS_MAX, total: HEARTS_MAX });
  });

  it('empties (and never goes negative) at zero or below', async () => {
    await render(<HealthBar hearts={-3} />);
    expect(segs().filled).toBe(0);
  });

  it('never draws more filled segments than the ceiling', async () => {
    await render(<HealthBar hearts={99} />);
    const s = segs();
    expect(s.filled).toBe(s.total);
  });

  it('draws against the run ceiling, which the Extra Heart boon raises', async () => {
    // Reading HEARTS_MAX instead would render an over-full bar.
    await render(<HealthBar hearts={12} maxHearts={12} />);
    expect(segs()).toEqual({ filled: 12, total: 12 });
  });

  it('drops both emoji', async () => {
    await render(<HealthBar hearts={3} />);
    expect(screen.queryByText('❤️')).toBeNull();
    expect(screen.queryByText('✚')).toBeNull();
  });
});
