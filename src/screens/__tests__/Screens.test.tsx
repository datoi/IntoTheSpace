import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { MenuScreen, GameOverScreen, ShopScreen } from '../Screens';
import { SaveData } from '../../game/storage';
import { RunResult } from '../../game/types';
import { AVATARS } from '../../game/constants';

const freshSave: SaveData = {
  best: 0,
  likes: 0,
  unlocked: ['ironclad'],
  selectedAvatar: 'ironclad',
};

describe('MenuScreen', () => {
  it('renders the title and coins but hides BEST before the first run', async () => {
    await render(<MenuScreen save={{ ...freshSave, likes: 40 }} onStart={jest.fn()} onShop={jest.fn()} />);
    expect(screen.getByText('SPACE')).toBeTruthy();
    expect(screen.queryByText(/BEST/)).toBeNull();
    expect(screen.getByText('40')).toBeTruthy();
  });

  it('shows best distance and coins once a run is banked', async () => {
    const save = { ...freshSave, best: 800, likes: 25 };
    await render(<MenuScreen save={save} onStart={jest.fn()} onShop={jest.fn()} />);
    expect(screen.getByText(/BEST 800m/)).toBeTruthy();
    expect(screen.getByText('25')).toBeTruthy();
  });

  it('starts the game and opens the shop', async () => {
    const onStart = jest.fn();
    const onShop = jest.fn();
    await render(<MenuScreen save={freshSave} onStart={onStart} onShop={onShop} />);
    await fireEvent.press(screen.getByText('LIFT OFF 🚀'));
    expect(onStart).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('AVATARS'));
    expect(onShop).toHaveBeenCalledTimes(1);
  });

  it('falls back to the first avatar when the selected id is unknown', async () => {
    const save = { ...freshSave, selectedAvatar: 'deleted-avatar' };
    await expect(
      render(<MenuScreen save={save} onStart={jest.fn()} onShop={jest.fn()} />)
    ).resolves.toBeTruthy();
  });
});

describe('GameOverScreen', () => {
  const result: RunResult = { coins: 3, altitude: 1450 };

  it('shows the run distance', async () => {
    await render(
      <GameOverScreen result={result} best={2000} isNewBest={false} onRestart={jest.fn()} onMenu={jest.fn()} />
    );
    expect(screen.getByText('1450m')).toBeTruthy();
    expect(screen.getByText(/BEST 2000m/)).toBeTruthy();
  });

  it('reports the coins the run banked', async () => {
    await render(
      <GameOverScreen result={result} best={2000} isNewBest={false} onRestart={jest.fn()} onMenu={jest.fn()} />
    );
    expect(screen.getByText('+3 COLLECTED')).toBeTruthy();
  });

  it('shows a zeroed run without hiding the coin line', async () => {
    const blank: RunResult = { coins: 0, altitude: 0 };
    await render(
      <GameOverScreen result={blank} best={0} isNewBest={false} onRestart={jest.fn()} onMenu={jest.fn()} />
    );
    expect(screen.getByText('+0 COLLECTED')).toBeTruthy();
  });

  it('no longer reports a score — distance is the only one', async () => {
    await render(
      <GameOverScreen result={result} best={2000} isNewBest={false} onRestart={jest.fn()} onMenu={jest.fn()} />
    );
    expect(screen.queryByText(/SCORE/)).toBeNull();
    expect(screen.queryByText(/COMBO/)).toBeNull();
    expect(screen.getByText('1450m')).toBeTruthy();
  });

  it('celebrates a new best instead of showing the old one', async () => {
    await render(
      <GameOverScreen result={result} best={1450} isNewBest onRestart={jest.fn()} onMenu={jest.fn()} />
    );
    expect(screen.getByText('NEW BEST')).toBeTruthy();
    expect(screen.queryByText(/BEST 1450m/)).toBeNull();
  });

  it('restarts and returns to menu', async () => {
    const onRestart = jest.fn();
    const onMenu = jest.fn();
    await render(
      <GameOverScreen result={result} best={2000} isNewBest={false} onRestart={onRestart} onMenu={onMenu} />
    );
    await fireEvent.press(screen.getByText('LAUNCH AGAIN'));
    expect(onRestart).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Back to menu'));
    expect(onMenu).toHaveBeenCalledTimes(1);
  });
});

describe('ShopScreen', () => {
  const richSave: SaveData = {
    best: 100,
    likes: 200,
    unlocked: ['ironclad', 'specter'],
    selectedAvatar: 'specter',
  };

  const renderShop = async (save: SaveData) => {
    const onBuy = jest.fn();
    const onSelect = jest.fn();
    const onBack = jest.fn();
    await render(<ShopScreen save={save} onBuy={onBuy} onSelect={onSelect} onBack={onBack} />);
    return { onBuy, onSelect, onBack };
  };

  it('lists every avatar with its state (equipped / owned / price)', async () => {
    await renderShop(richSave);
    for (const a of AVATARS) expect(screen.getByText(a.name)).toBeTruthy();
    expect(screen.getByText('EQUIPPED')).toBeTruthy(); // specter
    expect(screen.getByText('Tap to equip')).toBeTruthy(); // ironclad
    expect(screen.getByText('150')).toBeTruthy(); // raptor price
  });

  it('shows the coin balance', async () => {
    await renderShop(richSave);
    expect(screen.getByText('200 coins')).toBeTruthy();
  });

  it('selects an owned avatar instead of buying it again', async () => {
    const { onBuy, onSelect } = await renderShop(richSave);
    await fireEvent.press(screen.getByText('Ironclad'));
    expect(onSelect).toHaveBeenCalledWith('ironclad');
    expect(onBuy).not.toHaveBeenCalled();
  });

  it('buys an affordable locked avatar', async () => {
    const { onBuy, onSelect } = await renderShop(richSave); // 200 coins, raptor costs 150
    await fireEvent.press(screen.getByText('Raptor'));
    expect(onBuy).toHaveBeenCalledWith('raptor');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does nothing when pressing an unaffordable avatar and marks it locked', async () => {
    const { onBuy, onSelect } = await renderShop(richSave); // valkyrie costs 500
    await fireEvent.press(screen.getByText('Valkyrie'));
    expect(onBuy).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getAllByText('🔒').length).toBeGreaterThan(0);
  });

  it('affordability is inclusive: exact coin balance can buy', async () => {
    const { onBuy } = await renderShop({ ...richSave, likes: 150 });
    await fireEvent.press(screen.getByText('Raptor'));
    expect(onBuy).toHaveBeenCalledWith('raptor');
  });

  it('goes back', async () => {
    const { onBack } = await renderShop(richSave);
    await fireEvent.press(screen.getByText('BACK'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
