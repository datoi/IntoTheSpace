import React from 'react';
import { render, screen, act } from '@testing-library/react-native';
import LoadingScreen from '../LoadingScreen';
import { PRELOAD_SPRITES } from '../../game/preload';

const countImages = (): number => {
  let count = 0;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Image') count++;
    (node.children ?? []).forEach(walk);
  };
  walk(screen.toJSON());
  return count;
};

const fireOnAllImages = (handler: 'onLoad' | 'onError') => {
  const nodes: any[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Image') nodes.push(node);
    (node.children ?? []).forEach(walk);
  };
  walk(screen.toJSON());
  for (const n of nodes) n.props[handler]?.();
};

describe('LoadingScreen', () => {
  it('mounts every gameplay sprite so it decodes before the run', async () => {
    await render(<LoadingScreen progress={0} onSpritesDecoded={jest.fn()} />);
    expect(countImages()).toBe(PRELOAD_SPRITES.length);
  });

  it('reports progress as a percentage', async () => {
    await render(<LoadingScreen progress={0.42} onSpritesDecoded={jest.fn()} />);
    expect(screen.getByText(/42%/)).toBeTruthy();
  });

  it('clamps out-of-range progress instead of overflowing the bar', async () => {
    const { rerender } = await render(<LoadingScreen progress={-1} onSpritesDecoded={jest.fn()} />);
    expect(screen.getByText(/0%/)).toBeTruthy();
    await rerender(<LoadingScreen progress={5} onSpritesDecoded={jest.fn()} />);
    expect(screen.getByText(/100%/)).toBeTruthy();
  });

  it('reports decoded only once every sprite has painted', async () => {
    const onSpritesDecoded = jest.fn();
    await render(<LoadingScreen progress={1} onSpritesDecoded={onSpritesDecoded} />);
    expect(onSpritesDecoded).not.toHaveBeenCalled();
    await act(async () => fireOnAllImages('onLoad'));
    expect(onSpritesDecoded).toHaveBeenCalledTimes(1);
  });

  it('counts a sprite that fails to decode, so one bad asset cannot stall boot', async () => {
    const onSpritesDecoded = jest.fn();
    await render(<LoadingScreen progress={1} onSpritesDecoded={onSpritesDecoded} />);
    await act(async () => fireOnAllImages('onError'));
    expect(onSpritesDecoded).toHaveBeenCalledTimes(1);
  });

  it('reports decoded at most once', async () => {
    const onSpritesDecoded = jest.fn();
    await render(<LoadingScreen progress={1} onSpritesDecoded={onSpritesDecoded} />);
    await act(async () => fireOnAllImages('onLoad'));
    await act(async () => fireOnAllImages('onLoad'));
    expect(onSpritesDecoded).toHaveBeenCalledTimes(1);
  });
});
