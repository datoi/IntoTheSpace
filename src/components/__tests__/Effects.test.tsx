import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ParticleView, FloatTextView, HUD } from '../Effects';
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
    hearts: 3,
    coins: 7,
    alt: 1234.6,
    gun: 'single' as const,
    gunTime: 0,
    gunLevel: 1,
  };

  it('headlines the distance and shows coins and the heart count', async () => {
    await render(<HUD {...base} />);
    expect(screen.getByText('🚀 1235m')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('❤️ 3')).toBeTruthy();
  });

  it('keeps the heart count on one line at HEARTS_MAX', async () => {
    await render(<HUD {...base} hearts={HEARTS_MAX} />);
    expect(screen.getByText(`❤️ ${HEARTS_MAX}`)).toBeTruthy();
  });

  it('never shows negative altitude', async () => {
    await render(<HUD {...base} alt={-5} />);
    expect(screen.getByText('🚀 0m')).toBeTruthy();
  });

  it('clamps the heart count to 0 rather than showing a negative', async () => {
    for (const hearts of [0, -1]) {
      await render(<HUD {...base} hearts={hearts} />);
      expect(screen.getByText('❤️ 0')).toBeTruthy();
      await screen.unmount();
    }
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
