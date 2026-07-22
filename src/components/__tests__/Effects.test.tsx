import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ParticleView, FloatTextView, HUD, HealthBar } from '../Effects';
import { Particle, FloatText } from '../../game/types';
import { GUN_LABEL, HEARTS_MAX } from '../../game/constants';

const particle: Particle = { id: 1, x: 10, y: 20, vx: 0, vy: 0, life: 0.5, color: '#FF0000', size: 6 };

const flatten = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

const rootStyle = () => flatten((screen.toJSON() as any).props.style);

describe('ParticleView', () => {
  it('renders at its position with its size and color', async () => {
    await render(<ParticleView p={particle} />);
    const style = rootStyle();
    expect(style.left).toBe(10);
    expect(style.top).toBe(20);
    expect(style.width).toBe(6);
    expect(style.height).toBe(6);
    expect(style.backgroundColor).toBe('#FF0000');
  });

  it('fades out: opacity is clamped to 1 and scales down with remaining life', async () => {
    await render(<ParticleView p={{ ...particle, life: 2 }} />);
    expect(rootStyle().opacity).toBe(1);
    await screen.rerender(<ParticleView p={{ ...particle, life: 0.1 }} />);
    expect(rootStyle().opacity).toBeCloseTo(0.25);
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
    expect(flatten(screen.getByText('+30').props.style).left).toBe(40);
  });
});

describe('HUD', () => {
  const base = {
    coins: 7,
    alt: 1234.6,
    gun: 'single' as const,
    gunTime: 0,
    gunLevel: 1,
  };

  it('headlines the distance and shows coins', async () => {
    await render(<HUD {...base} />);
    expect(screen.getByText('🚀 1235m')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('never shows negative altitude', async () => {
    await render(<HUD {...base} alt={-5} />);
    expect(screen.getByText('🚀 0m')).toBeTruthy();
  });

  it('hides the gun banner for the default single shooter', async () => {
    await render(<HUD {...base} />);
    expect(screen.queryByText(/DOUBLE|BOMB|LASER|HOMING/)).toBeNull();
  });

  it('shows gun label with seconds remaining, rounded up', async () => {
    await render(<HUD {...base} gun="laser" gunTime={7.2} />);
    expect(screen.getByText(`${GUN_LABEL.laser} · 8s`)).toBeTruthy();
  });

  it('shows the stack multiplier when a gun is stacked', async () => {
    await render(<HUD {...base} gun="bomb" gunTime={3} gunLevel={3} />);
    expect(screen.getByText(`${GUN_LABEL.bomb} ×3 · 3s`)).toBeTruthy();
  });

  it('never shows negative gun time', async () => {
    await render(<HUD {...base} gun="double" gunTime={-0.4} />);
    expect(screen.getByText(`${GUN_LABEL.double} · 0s`)).toBeTruthy();
  });
});

describe('HealthBar', () => {
  // The fill is the only node with a percentage height.
  const fillPct = (): string | undefined => {
    let pct: string | undefined;
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      const style = flatten(node.props?.style ?? {});
      if (typeof style.height === 'string' && style.height.endsWith('%')) pct = style.height;
      (node.children ?? []).forEach(walk);
    };
    walk(screen.toJSON());
    return pct;
  };

  it('fills in proportion to current hearts', async () => {
    await render(<HealthBar hearts={HEARTS_MAX / 2} />);
    expect(fillPct()).toBe('50%');
  });

  it('is full at HEARTS_MAX', async () => {
    await render(<HealthBar hearts={HEARTS_MAX} />);
    expect(fillPct()).toBe('100%');
  });

  it('empties (and never goes negative) at zero or below', async () => {
    await render(<HealthBar hearts={-3} />);
    expect(fillPct()).toBe('0%');
  });
});
