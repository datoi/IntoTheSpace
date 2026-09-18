/**
 * The chrome rule, enforced as a test.
 *
 * Retinting the shell per background is the kind of change that looks fine on
 * the three skies that exist today and quietly breaks on the fourth: someone
 * adds a background with a yellow-green nebula, the ink ramp rotates with it,
 * and secondary text lands at 3:1 on a surface nobody re-checked. So the
 * invariants are mechanical rather than a comment nobody reads:
 *
 *   lightness is preserved  — a theme may rotate hue, never lighten or darken
 *   contrast never regresses — every theme clears AA on every text pairing
 *   meaning never rotates    — plasma/threat/gold are not part of the chrome
 */
import { PALETTE, BACKGROUNDS } from '../constants';
import {
  Chrome,
  DEFAULT_CHROME,
  chromeFor,
  chromeFrom,
  contrast,
  hexToHsl,
  hslToHex,
} from '../theme';

/** WCAG AA for body text. */
const AA = 4.5;
/** WCAG AA for large/bold text and UI components. */
const AA_LARGE = 3;

const THEMES: [string, Chrome][] = [
  ['default', DEFAULT_CHROME],
  ...BACKGROUNDS.map((b) => [b.id, chromeFor(b.id)] as [string, Chrome]),
];

describe('the colour maths', () => {
  it('round-trips hex through HSL', () => {
    for (const hex of ['#05070E', '#FFC93C', '#35D6FF', '#000000', '#FFFFFF', '#7E90AE']) {
      expect(hslToHex(hexToHsl(hex))).toBe(hex.toUpperCase());
    }
  });

  it('computes the contrast ratios WCAG defines', () => {
    // The two anchors from the spec: identical colours are 1:1, black on white
    // is 21:1. If these drift, every threshold below is measuring nothing.
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#000000', '#FFFFFF')).toBe(contrast('#FFFFFF', '#000000'));
  });
});

describe('every background declares its chrome', () => {
  it.each(BACKGROUNDS.map((b) => [b.id, b] as const))('%s has a usable hue', (_id, bg) => {
    expect(bg.chrome).toBeDefined();
    expect(bg.chrome.hue).toBeGreaterThanOrEqual(0);
    expect(bg.chrome.hue).toBeLessThan(360);
    if (bg.chrome.sat !== undefined) {
      expect(bg.chrome.sat).toBeGreaterThan(0);
      expect(bg.chrome.sat).toBeLessThanOrEqual(1);
    }
  });

  it('gives each background its own chrome', () => {
    // Two skies sharing a hue is not an error, but two skies sharing an *id*
    // in the lookup would silently hand one of them the other's chrome.
    const ids = BACKGROUNDS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('falls back to the shipped chrome for an unknown id', () => {
    // A save carrying a background that a later build removed must not crash
    // the shell; storage.ts already re-points it, this is the second net.
    expect(chromeFor('no-such-sky')).toBe(DEFAULT_CHROME);
    expect(chromeFor(undefined)).toBe(DEFAULT_CHROME);
  });

  it('hands back a stable object per id', () => {
    // useThemedStyles caches on this identity. If chromeFor ever starts
    // allocating per call, every screen rebuilds its StyleSheet every render
    // and nothing visibly breaks — which is exactly why it needs a test.
    for (const b of BACKGROUNDS) expect(chromeFor(b.id)).toBe(chromeFor(b.id));
  });
});

describe('no two skies look alike', () => {
  // The catalogue's whole selling point is that each background is a DIFFERENT
  // place. Two skies a few degrees apart would still pass every contrast test
  // in this file while being indistinguishable in the shop, so the separation
  // needs its own guard - this is the one that fails when someone adds a
  // fourth blue.

  /** Shortest distance between two hues, in degrees (0-180). */
  const hueGap = (a: number, b: number) => {
    const d = Math.abs(((a - b) % 360 + 360) % 360);
    return Math.min(d, 360 - d);
  };

  /** Every unordered pair of backgrounds. */
  const PAIRS = BACKGROUNDS.flatMap((a, i) => BACKGROUNDS.slice(i + 1).map((b) => [a, b] as const));

  it.each(PAIRS.map((p) => [`${p[0].id} vs ${p[1].id}`, p[0], p[1]] as const))(
    '%s are far enough apart to tell apart',
    (_label, a, b) => {
      // 30 degrees is about where two dark surfaces stop reading as the same
      // colour. The closest shipped pair is Azure at 215 and Violet at 252.
      expect(hueGap(a.chrome.hue, b.chrome.hue)).toBeGreaterThanOrEqual(30);
    }
  );

  it('gives every sky a visibly different accent', () => {
    // The accent is the loudest thing a theme changes, so duplicates there are
    // the most obvious. Distinct values, not just distinct hues.
    const accents = BACKGROUNDS.map((b) => chromeFor(b.id).accent);
    expect(new Set(accents).size).toBe(accents.length);
  });

  it('keeps every accent clear of the two colours the HUD already owns', () => {
    // `energy` (the special meter, hue 144) and `plasma` (the player, 192) are
    // both bright and both on screen during a run - and the pause menu puts the
    // accent right next to them. An accent landing on either would read as a
    // gameplay signal. This is why Jade sits at 168 rather than the 155 its art
    // measures: 168 is the midpoint of the only gap between them.
    const hueOf = (hex: string) => hexToHsl(hex).h;
    const gap = (a: number, b: number) => {
      const d = Math.abs(((a - b) % 360 + 360) % 360);
      return Math.min(d, 360 - d);
    };
    for (const bg of BACKGROUNDS) {
      const h = hueOf(chromeFor(bg.id).accent);
      expect(gap(h, hueOf(PALETTE.energy))).toBeGreaterThan(20);
      // plasma is excepted for the default-equivalent skies: Azure IS the blue
      // the shipped chrome was drawn for. Everything else must clear it.
      if (bg.id !== 'azure') expect(gap(h, hueOf(PALETTE.plasma))).toBeGreaterThan(20);
    }
  });

  it('has a distinct name and price for each', () => {
    const names = BACKGROUNDS.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
    // Exactly one free starter, and the rest priced in ascending order so the
    // shop reads as a ladder rather than a shelf.
    const prices = BACKGROUNDS.map((b) => b.price);
    expect(prices.filter((p) => p === 0)).toHaveLength(1);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });
});

describe('a theme rotates hue and nothing else', () => {
  const KEYS = ['void', 'hull', 'hullHi', 'edge', 'ink', 'inkDim', 'inkMute'] as const;

  it.each(BACKGROUNDS.map((b) => [b.id, b] as const))(
    '%s keeps the shipped lightness on every token',
    (id, bg) => {
      const c = chromeFor(id) as unknown as Record<string, string>;
      for (const k of KEYS) {
        const base = hexToHsl(PALETTE[k]);
        const themed = hexToHsl(c[k]);
        // Within a rounding step of 8-bit quantisation.
        expect(themed.l).toBeCloseTo(base.l, 2);
      }
      // ...and it really did move the hue it claims to. The tolerance is
      // 8-bit quantisation: at Ember's low saturation the whole ramp spans a
      // handful of values per channel, so a declared 14 lands at 10.9.
      expect(Math.abs(hexToHsl(c.hull).h - bg.chrome.hue)).toBeLessThan(4);
    }
  );

  it('scales saturation only where a background asks it to', () => {
    for (const bg of BACKGROUNDS) {
      const themed = hexToHsl((chromeFor(bg.id) as unknown as Record<string, string>).hull);
      const base = hexToHsl(PALETTE.hull);
      expect(Math.abs(themed.s - base.s * (bg.chrome.sat ?? 1))).toBeLessThan(0.02);
    }
  });

  it('keeps edgeSoft translucent', () => {
    // It is drawn OVER a card rather than replacing it. Retinting it into an
    // opaque hex would turn every internal divider into a solid bar.
    for (const [, c] of THEMES) expect(c.edgeSoft).toMatch(/^rgba\(/);
  });
});

describe('contrast survives every theme', () => {
  it.each(THEMES)('%s clears AA on text', (_id, c) => {
    // Primary text, on both surfaces it is ever drawn on.
    expect(contrast(c.ink, c.void)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.ink, c.hull)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.ink, c.hullHi)).toBeGreaterThanOrEqual(AA);
    // Secondary text. This is the tight one - inkDim on hull is the pairing a
    // careless hue would push under the line.
    expect(contrast(c.inkDim, c.hull)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.inkDim, c.void)).toBeGreaterThanOrEqual(AA);
  });

  it.each(THEMES)('%s keeps tertiary ink where the shipped palette put it', (_id, c) => {
    // NOT an AA assertion, on purpose. `inkMute` is 2.75:1 on hull in the
    // shipped default - below AA and below AA_LARGE - because it is used for
    // disabled states and hairline labels rather than for anything you are
    // expected to read. That predates theming and is the designer's call; what
    // theming owes is not making it worse, which the relative test below
    // enforces. This floor just stops a future hue from tanking it outright.
    expect(contrast(c.inkMute, c.hull)).toBeGreaterThan(2.3);
  });

  it.each(THEMES)('%s never falls far below the shipped default', (_id, c) => {
    // The absolute floors above are the safety net; this is the regression
    // guard. A new hue may cost a little contrast (relative luminance is not
    // flat across hue at fixed lightness) but not a visible amount.
    const pairs: [keyof Chrome, keyof Chrome][] = [
      ['ink', 'void'],
      ['ink', 'hull'],
      ['inkDim', 'hull'],
      ['inkMute', 'hull'],
    ];
    for (const [fg, bg] of pairs) {
      const got = contrast(c[fg], c[bg]);
      const want = contrast(DEFAULT_CHROME[fg], DEFAULT_CHROME[bg]);
      expect(got).toBeGreaterThan(want * 0.85);
    }
  });

  it.each(THEMES)('%s keeps borders visible against their surface', (_id, c) => {
    // A border is not text, so it does not owe AA - but it does have to be
    // SEEN, and a border that matches its own fill is just a wasted pixel.
    // Measured on the shipped default: edge/hull is 1.40, hull/void is 1.08.
    // The card is separated from the backdrop mostly by its border, not by its
    // fill, which is why the second threshold is the looser of the two.
    expect(contrast(c.edge, c.hull)).toBeGreaterThan(1.25);
    expect(contrast(c.hull, c.void)).toBeGreaterThan(1.05);
  });

  it('keeps the semantic colours legible on every themed surface', () => {
    // These do NOT rotate, so a theme can only hurt them by moving the ground
    // underneath. Gold on hull is the pairing that pays for prices and the
    // chain counter; plasma is every player-side readout.
    for (const [, c] of THEMES) {
      expect(contrast(PALETTE.gold, c.hull)).toBeGreaterThanOrEqual(AA);
      expect(contrast(PALETTE.plasma, c.hull)).toBeGreaterThanOrEqual(AA);
      expect(contrast(PALETTE.threat, c.hull)).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });
});

describe('the accent', () => {
  it.each(THEMES)('%s keeps its dark label readable', (_id, c) => {
    // LIFT OFF and CONTINUE are dark-on-bright. This is the pairing the
    // luminance floor exists to protect.
    expect(contrast(c.accentInk, c.accent)).toBeGreaterThanOrEqual(AA);
  });

  it.each(THEMES)('%s reads as bright against the ground', (_id, c) => {
    // It is also used as TEXT - the "SPACE" half of the title - on both the
    // backdrop and on cards, so it owes AA there too.
    expect(contrast(c.accent, c.void)).toBeGreaterThanOrEqual(AA);
    expect(contrast(c.accent, c.hull)).toBeGreaterThanOrEqual(AA);
  });

  it('carries a glow that follows it', () => {
    // The menu's hull pedestal is lit by this. It was a fixed translucent cyan,
    // which is the one thing in a rose-lit room that refuses to belong to it.
    expect(DEFAULT_CHROME.accentGlow).toBe(PALETTE.plasmaGlow);
    for (const bg of BACKGROUNDS) {
      const c = chromeFor(bg.id);
      expect(c.accentGlow).not.toBe(PALETTE.plasmaGlow);
      // …and it is the accent itself at alpha, not some other hue that happens
      // to be nearby. withAlpha packs to rgba(), so compare channels.
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.accent.slice(i, i + 2), 16));
      expect(c.accentGlow).toBe(`rgba(${r},${g},${b},0.35)`);
    }
  });

  it('is the shipped brand colour under the default chrome', () => {
    // Equipping nothing has to look exactly like the build did before theming.
    expect(DEFAULT_CHROME.accent).toBe(PALETTE.plasma);
  });

  it('parts from the player colour under every other sky', () => {
    // The point of having a separate token at all. `plasma` is the ship.
    for (const bg of BACKGROUNDS) {
      expect(chromeFor(bg.id).accent).not.toBe(PALETTE.plasma);
    }
  });

  it('stays vivid where the hue is already bright enough', () => {
    // The floor lifts only the hues that need it. Ember's sits well above it,
    // so its accent must be the plain rotation - a dusty orange would mean the
    // floor had been applied as a target instead.
    const ember = chromeFor('ember').accent;
    const plasma = hexToHsl(PALETTE.plasma);
    expect(ember).toBe(hslToHex({ h: 14, s: plasma.s, l: plasma.l }));
  });

  it('ignores the ground saturation scale', () => {
    // Ember pulls its GROUND saturation to 0.6 so the panels do not read as
    // brown. Applying that to the accent would give a dusty CTA.
    for (const bg of BACKGROUNDS) {
      expect(hexToHsl(chromeFor(bg.id).accent).s).toBeCloseTo(hexToHsl(PALETTE.plasma).s, 2);
    }
  });

  it('holds the floor for a hue nobody has shipped yet', () => {
    // Every hue on the wheel, including the dark blues and violets that are the
    // reason the floor exists at all.
    for (let hue = 0; hue < 360; hue += 5) {
      const c = chromeFrom({ hue });
      expect(contrast(c.accentInk, c.accent)).toBeGreaterThanOrEqual(AA);
      expect(contrast(c.accent, c.hull)).toBeGreaterThanOrEqual(AA);
      expect(contrast(c.accent, c.void)).toBeGreaterThanOrEqual(AA);
    }
  });

  it('keeps the pause scrim translucent so the run shows through', () => {
    // An opaque scrim would hide the field the player paused to look at.
    for (const [, c] of THEMES) {
      expect(c.scrim.slice(0, 5)).toBe("rgba" + "(");
      const alpha = Number(c.scrim.split(',').pop()!.replace(')', ''));
      expect(alpha).toBeGreaterThan(0.5);
      expect(alpha).toBeLessThan(1);
    }
  });
});

describe('the friend/foe rule outlives theming', () => {
  it('has no semantic colour in the chrome', () => {
    // The whole point of the split. If `plasma` ever becomes themeable, a
    // violet sky can drag the player's colour toward the enemy's and
    // palette.test.ts will not notice, because it only checks the constants.
    const chromeKeys = Object.keys(DEFAULT_CHROME);
    for (const banned of ['plasma', 'threat', 'gold', 'vital', 'energy', 'violet', 'amber']) {
      expect(chromeKeys).not.toContain(banned);
    }
  });

  it('leaves the semantic constants byte-identical under every theme', () => {
    // chromeFrom must be pure. It reads PALETTE; if it ever mutated it, the
    // first background equipped would repaint the game itself.
    const before = JSON.stringify(PALETTE);
    for (const bg of BACKGROUNDS) chromeFrom(bg.chrome);
    chromeFrom({ hue: 90, sat: 0.5 });
    expect(JSON.stringify(PALETTE)).toBe(before);
  });

  it('holds contrast for a hue nobody has shipped yet', () => {
    // The real target of this file: the background that does not exist. Every
    // hue on the wheel, at the shipped saturation, must still clear AA.
    for (let hue = 0; hue < 360; hue += 15) {
      const c = chromeFrom({ hue });
      expect(contrast(c.ink, c.hull)).toBeGreaterThanOrEqual(AA);
      expect(contrast(c.inkDim, c.hull)).toBeGreaterThanOrEqual(AA);
      expect(contrast(c.ink, c.void)).toBeGreaterThanOrEqual(AA);
    }
  });
});
