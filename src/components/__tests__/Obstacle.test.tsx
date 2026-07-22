import React from 'react';
import { render, screen } from '@testing-library/react-native';
import ObstacleView from '../Obstacle';
import { Card } from '../../game/types';
import {
  ENEMY_SHIPS,
  BOSS_MINI_IMG,
  BOSS_GIANT_IMG,
  laneX,
  OB_VIS,
  GUN_PICKUP_IMG,
  AVATARS,
  COIN_GOLD,
} from '../../game/constants';

const baseCard: Card = {
  id: 1,
  kind: 'rage',
  lane: 2,
  y: 100,
  h: 36,
  emoji: '',
  hp: 1,
  maxHp: 1,
  hitT: 0,
  dead: false,
  deadT: 0,
  nearMissChecked: false,
};

const flatten = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

const rootStyle = () => flatten((screen.toJSON() as any).props.style);

const findImages = (): any[] => {
  const out: any[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Image') out.push(node);
    (node.children ?? []).forEach(walk);
  };
  walk(screen.toJSON());
  return out;
};

describe('ObstacleView — enemies', () => {
  it('renders the ship sprite for its tier', async () => {
    await render(<ObstacleView ob={{ ...baseCard, shipIdx: 2 }} />);
    const images = findImages();
    expect(images).toHaveLength(1);
    expect(images[0].props.source).toBe(ENEMY_SHIPS[2]);
  });

  it('falls back to the first ship when shipIdx is missing (old snapshots)', async () => {
    await render(<ObstacleView ob={{ ...baseCard, shipIdx: undefined }} />);
    expect(findImages()[0].props.source).toBe(ENEMY_SHIPS[0]);
  });

  it('clamps an out-of-range shipIdx to the last ship instead of crashing', async () => {
    await render(<ObstacleView ob={{ ...baseCard, shipIdx: 999 }} />);
    expect(findImages()[0].props.source).toBe(ENEMY_SHIPS[ENEMY_SHIPS.length - 1]);
  });

  it('is positioned at its lane center when not charging', async () => {
    await render(<ObstacleView ob={{ ...baseCard, lane: 3 }} />);
    expect(rootStyle().left).toBeCloseTo(laneX(3) - OB_VIS / 2);
  });

  it('follows its free position while charging', async () => {
    await render(<ObstacleView ob={{ ...baseCard, charging: true, cx: 42 }} />);
    expect(rootStyle().left).toBeCloseTo(42 - OB_VIS / 2);
  });
});

describe('ObstacleView — HP bar', () => {
  const hpFillWidth = (): string | undefined => {
    let width: string | undefined;
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      const style = flatten(node.props?.style ?? {});
      if (typeof style.width === 'string' && style.width.endsWith('%') && style.height === '100%') {
        width = style.width;
      }
      (node.children ?? []).forEach(walk);
    };
    walk(screen.toJSON());
    return width;
  };

  it('is hidden for one-hit obstacles', async () => {
    await render(<ObstacleView ob={baseCard} />);
    expect(hpFillWidth()).toBeUndefined();
  });

  it('shows remaining HP as a percentage for tanky enemies', async () => {
    await render(<ObstacleView ob={{ ...baseCard, hp: 3, maxHp: 6 }} />);
    expect(hpFillWidth()).toBe('50%');
  });

  it('never renders a negative width when hp dips below zero (overkill)', async () => {
    await render(<ObstacleView ob={{ ...baseCard, hp: -2, maxHp: 6, dead: false }} />);
    expect(hpFillWidth()).toBe('0%');
  });

  it('disappears once the obstacle is dead', async () => {
    await render(<ObstacleView ob={{ ...baseCard, hp: 0, maxHp: 6, dead: true, deadT: 0.05 }} />);
    expect(hpFillWidth()).toBeUndefined();
  });
});

describe('ObstacleView — bosses', () => {
  it('renders the mini boss art', async () => {
    await render(<ObstacleView ob={{ ...baseCard, boss: 'mini', w: 82, hp: 30, maxHp: 30 }} />);
    // Boss card has an HP bar too; the boss art is the Image node.
    expect(findImages()[0].props.source).toBe(BOSS_MINI_IMG);
  });

  it('renders the giant boss art', async () => {
    await render(<ObstacleView ob={{ ...baseCard, boss: 'giant', w: 132, hp: 80, maxHp: 80 }} />);
    expect(findImages()[0].props.source).toBe(BOSS_GIANT_IMG);
  });
});

describe('ObstacleView — pickups and death animation', () => {
  it('renders the heart emoji for a heart pickup', async () => {
    await render(<ObstacleView ob={{ ...baseCard, kind: 'heart', emoji: '❤️' }} />);
    expect(screen.getByText('❤️')).toBeTruthy();
  });

  it('draws a coin pickup rather than relying on an emoji', async () => {
    await render(<ObstacleView ob={{ ...baseCard, kind: 'coin', emoji: '' }} />);
    expect(findImages()).toHaveLength(0); // drawn, not a sprite
    // The gold face is a plain View, so assert on the rendered colour.
    const json = JSON.stringify(screen.toJSON());
    expect(json).toContain(COIN_GOLD);
  });

  it("shows a gun drop wearing that gun's own projectile art", async () => {
    await render(<ObstacleView ob={{ ...baseCard, kind: 'gift', gun: 'homing', emoji: '🚀' }} />);
    const images = findImages();
    expect(images).toHaveLength(1);
    expect(images[0].props.source).toBe(GUN_PICKUP_IMG.homing);
  });

  it("shows the laser drop wearing its beam art", async () => {
    await render(<ObstacleView ob={{ ...baseCard, kind: 'gift', gun: 'laser', emoji: '🔴' }} />);
    const images = findImages();
    expect(images).toHaveLength(1);
    expect(images[0].props.source).toBe(GUN_PICKUP_IMG.laser);
  });

  it("shows a double drop as two of the avatar's own shots", async () => {
    const shot = AVATARS[0].shot;
    await render(
      <ObstacleView ob={{ ...baseCard, kind: 'gift', gun: 'double', emoji: '🔫' }} avatarShot={shot} />
    );
    const images = findImages();
    expect(images).toHaveLength(2);
    expect(images[0].props.source).toBe(shot.src);
    expect(images[1].props.source).toBe(shot.src);
  });

  it('falls back to the emoji for a double drop when no avatar shot is given', async () => {
    await render(<ObstacleView ob={{ ...baseCard, kind: 'gift', gun: 'double', emoji: '🔫' }} />);
    expect(findImages()).toHaveLength(0);
    expect(screen.getByText('🔫')).toBeTruthy();
  });

  it('falls back to the emoji when a drop carries no gun (old snapshots)', async () => {
    await render(<ObstacleView ob={{ ...baseCard, kind: 'gift', gun: undefined, emoji: '🎁' }} />);
    expect(screen.getByText('🎁')).toBeTruthy();
  });

  it('fades and scales up while popping after death', async () => {
    await render(<ObstacleView ob={{ ...baseCard, dead: true, deadT: 0.09 }} />);
    const style = rootStyle();
    expect(style.opacity).toBeCloseTo(0.5);
    const scale = style.transform.find((t: any) => 'scale' in t).scale;
    expect(scale).toBeCloseTo(1.225);
  });

  it('is fully faded at the end of the pop window', async () => {
    await render(<ObstacleView ob={{ ...baseCard, dead: true, deadT: 0.18 }} />);
    expect(rootStyle().opacity).toBeCloseTo(0);
  });

  it('bumps scale briefly when hit by a bullet', async () => {
    await render(<ObstacleView ob={{ ...baseCard, hitT: 0.12, hp: 2, maxHp: 3 }} />);
    const scale = rootStyle().transform.find((t: any) => 'scale' in t).scale;
    expect(scale).toBeCloseTo(1.108);
  });
});
