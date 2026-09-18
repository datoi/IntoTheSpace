import React from 'react';
import { render, screen } from '@testing-library/react-native';
import PickupView from '../Pickup';
import { pickupFallMult } from '../../screens/GameScreen';
import { Card } from '../../game/types';
import { BOONS, BOON_KINDS, isInstant } from '../../game/pickups';
import { PICKUP_SPEED_VAR, PICKUP_VIS, PALETTE, GUN_GLOW, AVATARS } from '../../game/constants';

/**
 * The pickup shape system.
 *
 * Fourteen boons used to share ONE silhouette and six colours between them —
 * four of which land on amber alone — so colour was carrying information colour
 * cannot carry and a 24px glyph had to do the rest at falling speed. The class
 * owns the shape now, and these are the assertions that stop it collapsing back
 * to a disc with a tint on it.
 */

const drop = (over: Partial<Card>): Card => ({
  id: 1,
  kind: 'boon',
  lane: 2,
  cx: 100,
  y: 100,
  h: 36,
  emoji: '',
  hp: 1,
  maxHp: 1,
  hitT: 0,
  dead: false,
  deadT: 0,
  nearMissChecked: false,
  ...over,
});

/** Which shell was drawn, or undefined if neither. */
const shellOf = (): 'capsule' | 'crystal' | undefined => {
  if (screen.queryByTestId('pickup-capsule')) return 'capsule';
  if (screen.queryByTestId('pickup-crystal')) return 'crystal';
  return undefined;
};

describe('shape carries the class, not just the colour', () => {
  it('draws a timed boon as a capsule — something that runs out', async () => {
    await render(<PickupView ob={drop({ boon: 'shield' })} />);
    expect(shellOf()).toBe('capsule');
  });

  it('draws an instant boon as a crystal — something that resolves on contact', async () => {
    await render(<PickupView ob={drop({ boon: 'nuke' })} />);
    expect(shellOf()).toBe('crystal');
  });

  // The real guarantee: this holds for all fourteen, not for the two above. A
  // boon added later with a duration and no shell would be a silent regression
  // of the whole point of the system.
  it.each(BOON_KINDS)('%s gets the shell its duration implies', async (k) => {
    await render(<PickupView ob={drop({ boon: k })} />);
    expect(shellOf()).toBe(isInstant(k) ? 'crystal' : 'capsule');
  });

  it('draws a heart as a crystal, because a heart is an instant effect', async () => {
    await render(<PickupView ob={drop({ kind: 'heart' })} />);
    expect(shellOf()).toBe('crystal');
    expect(JSON.stringify(screen.toJSON())).toContain(PALETTE.vital);
  });

  // This used to assert four corner brackets, and it was changed deliberately.
  // The brackets were meant to say "fabricated hardware" next to a capsule of
  // contained energy; what they actually did was imply a rectangle — four
  // corners are the strongest closure cue there is, so the eye filled in a card
  // that nothing had drawn. The weapon tell is now the ABSENCE of a container,
  // which is a category difference rather than one more shape in the same
  // family, and is therefore the harder line.
  it('gives a gun drop no container at all — raw ordnance, not a framed card', async () => {
    await render(<PickupView ob={drop({ kind: 'gift', gun: 'laser' })} />);
    expect(shellOf()).toBeUndefined();
    expect(screen.queryAllByTestId('pickup-bracket')).toHaveLength(0);
    // Its only surround is a glow with no edge anywhere.
    expect(screen.queryByTestId('pickup-gun-halo')).toBeTruthy();
  });

  /**
   * The halo's colour, read off its gradient id.
   *
   * react-native-svg packs colours into ARGB integers before they reach the
   * host tree, so no hex string survives to be searched for. The gradient id is
   * keyed by colour on purpose — it has to be, so two drops of different guns
   * on screen together cannot share a `Defs` id — which makes it the one honest
   * handle on what this halo is actually painted with.
   */
  const haloColour = (): string | undefined => {
    let found: string | undefined;
    const walk = (n: any) => {
      if (!n || typeof n !== 'object') return;
      const name = n.props?.name;
      if (typeof name === 'string' && name.startsWith('pk-gun-')) found = '#' + name.slice(7);
      (n.children ?? []).forEach(walk);
    };
    walk(screen.toJSON());
    return found;
  };

  it.each([
    ['laser', GUN_GLOW.laser!],
    ['bomb', GUN_GLOW.bomb!],
    ['homing', GUN_GLOW.homing!],
  ] as const)('lights a %s drop in its own emission colour', async (gun, colour) => {
    // A glow has to be the light of the thing it belongs to. A shared gold halo
    // put a gold glow around a cyan beam — two light sources disagreeing — and
    // collided with the coin, which is the one drop that should own gold.
    await render(<PickupView ob={drop({ kind: 'gift', gun })} />);
    expect(haloColour()).toBe(colour.toUpperCase());
    expect(haloColour()).not.toBe(PALETTE.gold.toUpperCase());
  });

  it("lights a double drop in the equipped hull's own colour", async () => {
    // That drop wears the player's OWN bolt, so its glow follows the ship
    // rather than a table.
    const shot = AVATARS[0].shot;
    await render(<PickupView ob={drop({ kind: 'gift', gun: 'double' })} avatarShot={shot} />);
    expect(haloColour()).toBe(shot.tint.toUpperCase());
  });

  it('gives two different guns two different gradient ids', async () => {
    // Not cosmetic: react-native-svg has not always scoped `Defs` ids per svg
    // root on Android, so two drops sharing an id risks the second painting
    // itself with the first one's gradient.
    await render(<PickupView ob={drop({ kind: 'gift', gun: 'laser' })} />);
    const laser = haloColour();
    await screen.rerender(<PickupView ob={drop({ kind: 'gift', gun: 'homing' })} />);
    expect(haloColour()).not.toBe(laser);
  });

  it('leaves a coin as a plain disc, with no shell and no brackets', async () => {
    // Nothing reads as money faster than a disc, and nothing about it needed
    // fixing — it only needed to join the shared footprint and halo.
    await render(<PickupView ob={drop({ kind: 'coin' })} />);
    expect(shellOf()).toBeUndefined();
    expect(screen.queryAllByTestId('pickup-bracket')).toHaveLength(0);
  });

  it('keeps the shell and the glyph in the same colour family', async () => {
    // Shape says the class, colour says the family, the glyph says the effect.
    // If the shell stopped wearing the boon's colour the three channels would
    // collapse back to two.
    await render(<PickupView ob={drop({ boon: 'freeze' })} />);
    expect(JSON.stringify(screen.toJSON())).toContain(BOONS.freeze.color);
  });
});

describe('every drop shares one footprint', () => {
  it.each(['boon', 'coin', 'heart', 'gift'] as const)('%s', async (kind) => {
    // Three sizes (44 / 50 / 50) across four drop types is what made the screen
    // read as assembled. One number now, for all of them.
    await render(<PickupView ob={drop({ kind, boon: 'shield', gun: 'laser' })} />);
    const root = screen.toJSON() as unknown as { props: { style: unknown } };
    const style = Object.assign({}, ...[root.props.style].flat(Infinity).filter(Boolean));
    expect(style.width).toBe(PICKUP_VIS);
    expect(style.height).toBe(PICKUP_VIS);
  });
});

describe('the collection moment', () => {
  it('leaves a ring behind when taken', async () => {
    await render(<PickupView ob={drop({ boon: 'shield', dead: true, deadT: 0.02 })} />);
    expect(screen.queryByTestId('pickup-ring')).toBeTruthy();
  });

  it('is a flash, not a fade — the ring is gone well before the drop is', async () => {
    // A ring that lasted the whole death window would read as the pickup
    // dissolving. It has to land as an impact and get out of the way.
    await render(<PickupView ob={drop({ boon: 'shield', dead: true, deadT: 0.17 })} />);
    expect(screen.queryByTestId('pickup-ring')).toBeNull();
  });

  it('draws no ring while the drop is still falling', async () => {
    await render(<PickupView ob={drop({ boon: 'shield' })} />);
    expect(screen.queryByTestId('pickup-ring')).toBeNull();
  });
});

describe('pickupFallMult', () => {
  it('stays inside the declared variance for any id', () => {
    for (let id = 0; id < 200; id++) {
      const m = pickupFallMult(id);
      expect(m).toBeGreaterThanOrEqual(1 - PICKUP_SPEED_VAR - 1e-9);
      expect(m).toBeLessThanOrEqual(1 + PICKUP_SPEED_VAR + 1e-9);
    }
  });

  it('gives consecutive drops different speeds', () => {
    // Two drops that spawn back to back must not fall in step, which is the
    // whole reason the modulus is a prime rather than the phase count.
    expect(pickupFallMult(10)).not.toBeCloseTo(pickupFallMult(11), 5);
  });

  it('is derived from the id, so a resumed run falls exactly as it did', () => {
    expect(pickupFallMult(42)).toBe(pickupFallMult(42));
  });
});
