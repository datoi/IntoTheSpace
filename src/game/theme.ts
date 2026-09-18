// Chrome that follows the sky.
//
// Picking a background in the shop retints the menus: surfaces, borders and
// dividers take the hue of the sky you fly under, so the shell reads as part of
// the same world instead of a blue-black chrome bolted onto a violet nebula.
//
// WHAT MOVES, AND WHY ONLY THAT
//
// Only the *ground* tokens move — void/hull/hullHi/edge/edgeSoft and the ink
// ramp. The semantic colours do NOT: `plasma` is the player, `threat` is
// hostile, `gold` is a reward, and those three carry meaning the player learns
// in the first thirty seconds. Retinting them per background would make the
// friend/foe rule (see palette.test.ts) mean nothing — a violet sky would push
// `threat` toward the same hue as the boons it is supposed to contrast with.
// The sky changes the room's lighting; it does not change what red means.
//
// HOW THE RAMP IS DERIVED
//
// The shipped PALETTE ground is already a single hue family — 218-227deg at
// 36-47% saturation — so a theme is just that ramp rotated to a new hue. Every
// step keeps its lightness AND its saturation; only H changes. That is what
// makes this safe: contrast is dominated by lightness, so preserving L per step
// means no theme can quietly fall below the contrast the default ships with.
// `themes.test.ts` asserts that mechanically rather than trusting the argument.
//
// Hues come from the art, not from taste: scripts sampled each background's
// chroma-weighted mean (the hue the eye actually reads past all the black) and
// those measurements are recorded on BACKGROUNDS[].chrome.

import { PALETTE, BACKGROUNDS } from './constants';

/** The ground tokens, and only the ground tokens. */
export interface Chrome {
  void: string;
  hull: string;
  hullHi: string;
  edge: string;
  edgeSoft: string;
  ink: string;
  inkDim: string;
  inkMute: string;
  /**
   * The shell's one bright colour: LIFT OFF, CONTINUE, and the "SPACE" half of
   * the title. Derived from `plasma`'s saturation and lightness at the sky's
   * hue, so it stays as vivid as the shipped brand colour rather than fading
   * into the ground.
   *
   * This is NOT `plasma`. plasma is the player - their hull, their bullets,
   * their shield - and it does not move, ever. This is the chrome's accent, and
   * it only ever appears on shell furniture. They are the same value under the
   * default chrome and diverge under every other sky, which is exactly the
   * distinction: the menu belongs to the sky, the ship belongs to the player.
   */
  accent: string;
  /** The dark label drawn ON `accent`. Same hue, floor lightness. */
  accentInk: string;
  /**
   * `accent` at glow strength — the lit disc behind the menu's hull, and
   * anything else that wants the accent as a wash rather than as a fill.
   *
   * Exists for the same reason `accent` does: the shell had one translucent
   * cyan (`PALETTE.plasmaGlow`) doing this job, and a cyan glow under a rose
   * sky is the one thing in the room that refuses to belong to it.
   */
  accentGlow: string;
  /** The dim behind the pause menu. Translucent, so the run shows through. */
  scrim: string;
}

/** A background's contribution to the chrome: a hue, and how far to push it. */
export interface ChromeTint {
  /** Degrees, 0-360. Sampled from the background art. */
  hue: number;
  /**
   * Multiplier on the base ramp's saturation. 1 keeps the default's intensity.
   * Warm hues need less — the same saturation that reads as "deep space blue"
   * at 220deg reads as "brown" at 10deg, so Ember pulls its saturation down.
   */
  sat?: number;
}

// --- Colour maths -----------------------------------------------------------

interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** '#RRGGBB' -> [r, g, b], each 0-255. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

export function hexToHsl(hex: string): Hsl {
  const [r8, g8, b8] = hexToRgb(hex);
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (h * 60 + 360) % 360;
  const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (hh < 60) rgb = [c, x, 0];
  else if (hh < 120) rgb = [x, c, 0];
  else if (hh < 180) rgb = [0, c, x];
  else if (hh < 240) rgb = [0, x, c];
  else if (hh < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgbToHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255);
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio, 1..21. Order-independent. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// --- Derivation -------------------------------------------------------------

/** The keys that get retinted, in ramp order. */
const GROUND_KEYS = ['void', 'hull', 'hullHi', 'edge', 'ink', 'inkDim', 'inkMute'] as const;

/**
 * `edgeSoft` ships as rgba() because it sits *over* a card rather than
 * replacing it, so it has to keep its alpha. Its opaque half is retinted like
 * everything else and the alpha is re-applied.
 */
const EDGE_SOFT_ALPHA = 0.55;
const EDGE_SOFT_BASE = '#182235'; // the rgb half of PALETTE.edgeSoft

/**
 * The shipped accent label and pause scrim, which lived as bare literals in
 * Button.tsx and GameScreen.tsx before there was anywhere better to put them.
 * Both are retinted the same way as everything else.
 */
const ACCENT_INK_BASE = '#04121A'; // dark-on-bright, per the §3 allowlist
const SCRIM_BASE = '#060810';
const SCRIM_ALPHA = 0.82;
/** Matches the alpha PALETTE.plasmaGlow ships with, so the default is unchanged. */
const ACCENT_GLOW_ALPHA = 0.35;

/** Pack an opaque hex into an rgba() string at a fixed alpha. */
function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Rotate one token onto `tint`'s hue, keeping its lightness and (scaled)
 * saturation. Lightness is untouched on purpose — see the header.
 */
function retint(hex: string, tint: ChromeTint): string {
  const { s, l } = hexToHsl(hex);
  return hslToHex({ h: tint.hue, s: Math.min(1, s * (tint.sat ?? 1)), l });
}

/**
 * The luminance an accent is lifted to if its hue cannot reach it on its own.
 *
 * Hues are not equally bright. Cyan at 60% lightness is three times the
 * luminance of blue-violet at the same 60%, so rotating `plasma` straight onto
 * Violet's hue gave #5D35FF and left the dark label on LIFT OFF at 3.3:1 -
 * against 11:1 under every other sky. Matching plasma's luminance exactly fixes
 * the contrast but washes every accent out to a pastel, because the only way a
 * violet gets as bright as cyan is by heading for white.
 *
 * So this is a floor, not a target. A hue bright enough already is left exactly
 * where it lands (Azure and Ember both are, and stay vivid); only the hues that
 * fall short are lifted, and only as far as this line. 0.28 is where the
 * derived dark label clears 6:1 - comfortably past AA's 4.5 with room for a
 * hue nobody has picked yet. themes.test.ts checks all 360 of them.
 */
const ACCENT_LUM_FLOOR = 0.28;

/**
 * Retint at FULL saturation, with a floor under how dark the result may be.
 *
 * Two departures from `retint`, both of which the accent needs:
 *
 * 1. It ignores the tint's `sat` scale. That scale exists to stop the dark
 *    ground going muddy in the warm hues; the accent has the opposite job.
 *    Ember's panels are pulled to 0.6 so they do not read as brown, but its
 *    LIFT OFF button should still be a vivid ember orange, not a dusty one.
 *
 * 2. It enforces `lumFloor` - see ACCENT_LUM_FLOOR for why a floor rather than
 *    a match. Passing 0 (what `accentInk` does) makes this a plain hue
 *    rotation, which is what a near-black label wants.
 */
function retintVivid(hex: string, tint: ChromeTint, lumFloor = 0): string {
  const { s, l } = hexToHsl(hex);
  const natural = hslToHex({ h: tint.hue, s, l });
  const lum = luminance(natural);
  if (lum >= lumFloor) return natural;
  return hslToHex({ h: tint.hue, s, l: solveLightness(tint.hue, s, lumFloor, l) });
}

/**
 * The HSL lightness at which `hue`/`sat` hits `targetLum`.
 *
 * Luminance rises monotonically with lightness at fixed hue and saturation, so
 * a bisection converges; 24 steps takes it well past 8-bit resolution. If the
 * hue cannot reach the target even at white this lands on the closest it can,
 * which is the right fallback: as bright as that hue goes.
 */
function solveLightness(hue: number, sat: number, targetLum: number, fallback: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (luminance(hslToHex({ h: hue, s: sat, l: mid })) < targetLum) lo = mid;
    else hi = mid;
  }
  const got = (lo + hi) / 2;
  return Number.isFinite(got) ? got : fallback;
}

/** Build the full ground ramp for one tint. */
export function chromeFrom(tint: ChromeTint): Chrome {
  const out = {} as Record<string, string>;
  for (const k of GROUND_KEYS) out[k] = retint(PALETTE[k], tint);
  out.edgeSoft = withAlpha(retint(EDGE_SOFT_BASE, tint), EDGE_SOFT_ALPHA);
  out.accent = retintVivid(PALETTE.plasma, tint, ACCENT_LUM_FLOOR);
  out.accentGlow = withAlpha(out.accent, ACCENT_GLOW_ALPHA);
  out.accentInk = retintVivid(ACCENT_INK_BASE, tint);
  out.scrim = withAlpha(retint(SCRIM_BASE, tint), SCRIM_ALPHA);
  return out as unknown as Chrome;
}

/**
 * The shipped chrome, unretinted — what every screen falls back to before a
 * save is loaded, and what the loading screen and crash boundary always use.
 */
export const DEFAULT_CHROME: Chrome = {
  void: PALETTE.void,
  hull: PALETTE.hull,
  hullHi: PALETTE.hullHi,
  edge: PALETTE.edge,
  edgeSoft: PALETTE.edgeSoft,
  ink: PALETTE.ink,
  inkDim: PALETTE.inkDim,
  inkMute: PALETTE.inkMute,
  // Under the shipped chrome the accent IS plasma. Everywhere else they part.
  accent: PALETTE.plasma,
  accentGlow: PALETTE.plasmaGlow,
  accentInk: ACCENT_INK_BASE,
  scrim: withAlpha(SCRIM_BASE, SCRIM_ALPHA),
};

/**
 * One Chrome per background, built once at module load. There are three of
 * them and each is a few dozen arithmetic ops, so this is cheaper than the
 * bookkeeping any lazier scheme would need — and it means `chromeFor` never
 * allocates, which is what lets the themed-stylesheet cache key on identity.
 */
const BY_ID: Record<string, Chrome> = Object.fromEntries(
  BACKGROUNDS.map((b) => [b.id, chromeFrom(b.chrome)])
);

/** The chrome for a background id; the shipped default if the id is unknown. */
export function chromeFor(id: string | undefined): Chrome {
  return (id && BY_ID[id]) || DEFAULT_CHROME;
}
