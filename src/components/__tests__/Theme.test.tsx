/**
 * The chrome context, end to end.
 *
 * theme.test.ts proves the ramp is derived correctly. This proves the derived
 * ramp actually reaches the pixels: that equipping a background retints the
 * shell, that it does NOT retint the colours that carry meaning, and that the
 * per-theme stylesheet cache does its job instead of rebuilding every render.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { Button, IconButton } from '../Button';
import { ThemeProvider, useChrome, useThemedStyles } from '../Theme';
import { Chrome, chromeFor, contrast, DEFAULT_CHROME } from '../../game/theme';
import { PALETTE } from '../../game/constants';

const flatten = (style: unknown): Record<string, string> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

/** The style actually applied to a testID'd element. */
const styleOf = (testID: string) => flatten(screen.getByTestId(testID).props.style);

const sky = (id: string | undefined, node: React.ReactNode) => (
  <ThemeProvider backgroundId={id}>{node}</ThemeProvider>
);

describe('equipping a sky retints the shell', () => {
  it('gives a secondary button the equipped background hue', async () => {
    await render(sky('ember', <Button label="PLAY" onPress={jest.fn()} testID="btn" />));
    const ember = styleOf('btn');
    expect(ember.backgroundColor).toBe(chromeFor('ember').hull);
    expect(ember.borderColor).toBe(chromeFor('ember').edge);

    // ...and a different sky is a genuinely different colour, not the same
    // value arrived at twice. This is the assertion that would have caught the
    // context being wired up but never actually read.
    await screen.rerender(sky('violet', <Button label="PLAY" onPress={jest.fn()} testID="btn" />));
    const violet = styleOf('btn');
    expect(violet.backgroundColor).toBe(chromeFor('violet').hull);
    expect(violet.backgroundColor).not.toBe(ember.backgroundColor);
    expect(violet.borderColor).not.toBe(ember.borderColor);
  });

  it('retints the icon rail too', async () => {
    await render(sky('ember', <IconButton icon="shop" label="SHOP" onPress={jest.fn()} testID="rail" />));
    expect(styleOf('rail').backgroundColor).toBe(chromeFor('ember').hull);
  });

  it('falls back to the shipped chrome with no sky equipped', async () => {
    // What the loading screen and the pre-boot shell get.
    await render(sky(undefined, <Button label="PLAY" onPress={jest.fn()} testID="btn" />));
    expect(styleOf('btn').backgroundColor).toBe(PALETTE.hull);
    expect(styleOf('btn').borderColor).toBe(PALETTE.edge);
  });

  it('falls back to the shipped chrome for a background that no longer exists', async () => {
    await render(sky('deleted-sky', <Button label="PLAY" onPress={jest.fn()} testID="btn" />));
    expect(styleOf('btn').backgroundColor).toBe(DEFAULT_CHROME.hull);
  });

  it('renders unthemed outside any provider', async () => {
    // Every screen must still work if it is ever mounted on its own - which is
    // exactly what the existing screen tests do.
    await render(<Button label="PLAY" onPress={jest.fn()} testID="btn" />);
    expect(styleOf('btn').backgroundColor).toBe(PALETTE.hull);
  });
});

describe('the accent follows the sky', () => {
  it('paints the primary CTA in the equipped accent', async () => {
    // LIFT OFF, LAUNCH AGAIN, CONTINUE. Shell furniture, so it follows the sky.
    const cta = <Button label="LIFT OFF" variant="primary" onPress={jest.fn()} testID="btn" />;
    await render(sky('violet', cta));
    expect(styleOf('btn').backgroundColor).toBe(chromeFor('violet').accent);

    await screen.rerender(sky('ember', cta));
    expect(styleOf('btn').backgroundColor).toBe(chromeFor('ember').accent);
    expect(chromeFor('ember').accent).not.toBe(chromeFor('violet').accent);
  });

  it('keeps the CTA label readable on every accent', async () => {
    // The label is dark-on-bright, and how bright a hue gets at a given
    // lightness varies enormously - which is the whole reason the accent has a
    // luminance floor. This is that floor, observed through the actual widget.
    const cta = <Button label="LIFT OFF" variant="primary" onPress={jest.fn()} testID="btn" />;
    await render(sky('violet', cta));
    for (const id of ['violet', 'azure', 'ember']) {
      await screen.rerender(sky(id, cta));
      const label = flatten(screen.getByText('LIFT OFF').props.style).color;
      expect(label).toBe(chromeFor(id).accentInk);
      expect(contrast(label, chromeFor(id).accent)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('leaves the shipped look untouched with no sky equipped', async () => {
    // The accent IS plasma under the default chrome. Equipping nothing must
    // look exactly like the build did before any of this existed.
    await render(sky(undefined, <Button label="LIFT OFF" variant="primary" onPress={jest.fn()} testID="btn" />));
    expect(styleOf('btn').backgroundColor).toBe(PALETTE.plasma);
    expect(flatten(screen.getByText('LIFT OFF').props.style).color).toBe('#04121A');
  });
});

describe('meaning does not rotate with the sky', () => {
  it('keeps the accent distinct from the player colour', async () => {
    // The accent is chrome; `plasma` is the player's hull, bullets and shield.
    // They coincide under the default and must part under every other sky -
    // otherwise equipping a background would repaint the ship.
    expect(DEFAULT_CHROME.accent).toBe(PALETTE.plasma);
    for (const id of ['violet', 'azure', 'ember']) {
      expect(chromeFor(id).accent).not.toBe(PALETTE.plasma);
    }
  });

  it('keeps the unread badge hostile under every sky', async () => {
    const btn = <Button label="QUESTS" onPress={jest.fn()} badge={3} testID="btn" />;
    await render(sky('violet', btn));
    for (const id of ['violet', 'ember']) {
      await screen.rerender(sky(id, btn));
      // The badge count is drawn in the themed ink, on a threat-coloured pill.
      expect(flatten(screen.getByText('3').props.style).color).toBe(chromeFor(id).ink);
    }
  });
});

describe('the per-theme stylesheet cache', () => {
  // A fresh factory per test. The cache is module-level and deliberately
  // outlives unmounts, so sharing one factory across tests would let the first
  // test warm the cache for the second and make its counter meaningless.
  function makeProbe() {
    const state = { builds: 0, seen: [] as unknown[] };
    const factory = (c: Chrome) => {
      state.builds++;
      return { box: { backgroundColor: c.hull } };
    };
    const Probe = () => {
      const styles = useThemedStyles(factory);
      state.seen.push(styles);
      return <View testID="probe" style={styles.box} />;
    };
    return { state, Probe };
  }

  it('builds one stylesheet per theme, not one per render', async () => {
    const { state, Probe } = makeProbe();
    await render(sky('ember', <Probe />));
    await screen.rerender(sky('ember', <Probe />));
    await screen.rerender(sky('ember', <Probe />));
    expect(state.seen.length).toBeGreaterThanOrEqual(3); // it really did re-render
    expect(state.builds).toBe(1); // ...and reused the sheet every time
    expect(new Set(state.seen).size).toBe(1); // same object identity throughout
  });

  it('builds a second sheet when the sky changes, then reuses both', async () => {
    const { state, Probe } = makeProbe();
    await render(sky('ember', <Probe />));
    expect(state.builds).toBe(1);
    await screen.rerender(sky('violet', <Probe />));
    expect(state.builds).toBe(2);
    // Going back and forth costs nothing: this is the whole point of keying on
    // the Chrome object's identity rather than rebuilding per render.
    await screen.rerender(sky('ember', <Probe />));
    await screen.rerender(sky('violet', <Probe />));
    expect(state.builds).toBe(2);
  });

  it('keeps its sheets when a screen unmounts and comes back', async () => {
    // Navigating away from a screen and back is the common case, and it must
    // not pay to rebuild. The WeakMap only lets go once the factory itself is
    // unreachable, which for a module-level makeStyles means never.
    //
    // The remount is driven by changing a key rather than by calling unmount()
    // on the render result: in RNTL 14 an explicit unmount detaches the global
    // `screen`, and every later query in the file then misses. A key change is
    // also the closer analogue of what navigation actually does here.
    const { state, Probe } = makeProbe();
    const mounted = (k: string) => sky('ember', <View key={k}><Probe /></View>);
    await render(mounted('a'));
    expect(state.builds).toBe(1);
    await screen.rerender(mounted('b'));
    expect(screen.getByTestId('probe')).toBeTruthy(); // it really did remount
    expect(state.builds).toBe(1); // ...and reused the cached sheet
  });

  it('gives each screen its own sheet for the same sky', async () => {
    // Two factories, one theme: they must not collide in the cache.
    const a = makeProbe();
    const b = makeProbe();
    await render(
      sky('ember', (
        <>
          <a.Probe />
          <b.Probe />
        </>
      ))
    );
    expect(a.state.builds).toBe(1);
    expect(b.state.builds).toBe(1);
    expect(a.state.seen[0]).not.toBe(b.state.seen[0]);
  });
});

describe('useChrome', () => {
  function Readout() {
    const c = useChrome();
    return <Text testID="hull">{c.hull}</Text>;
  }

  it('hands components the equipped chrome', async () => {
    await render(sky('violet', <Readout />));
    expect(screen.getByTestId('hull').props.children).toBe(chromeFor('violet').hull);
  });

  it('defaults to the shipped chrome with no provider above it', async () => {
    await render(<Readout />);
    expect(screen.getByTestId('hull').props.children).toBe(PALETTE.hull);
  });
});
