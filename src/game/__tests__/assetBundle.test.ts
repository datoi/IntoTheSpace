import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, posix, sep } from 'path';

/**
 * Guards `assetBundlePatterns` in app.json.
 *
 * That list used to be `**\/*`, which bundled everything under assets/ —
 * including 6 MB of pre-bake source art that no code references and every user
 * was downloading. Narrowing it is free size, but the patterns now have to be
 * maintained by hand, and getting them wrong is quiet: a missed asset still
 * WORKS in development (Metro serves it) and only fails as a late-loading or
 * missing sprite on a real device, offline.
 *
 * So: every asset the code actually require()s must match a pattern — and
 * nothing outside the shipping tree may creep back into assets/.
 */

const ROOT = join(__dirname, '..', '..', '..');

const patterns: string[] = JSON.parse(
  readFileSync(join(ROOT, 'app.json'), 'utf8')
).expo.assetBundlePatterns;

/** Expo's patterns are plain globs; only `*` (no path separators) is used here. */
function matches(file: string): boolean {
  return patterns.some((p) => {
    const rx = new RegExp('^' + p.split('*').map(escape).join('[^/]*') + '$');
    return rx.test(file);
  });
}
const escape = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/** Every asset path require()'d anywhere in src/. */
function requiredAssets(): string[] {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      const src = readFileSync(full, 'utf8');
      for (const m of src.matchAll(/require\(['"](.+?)['"]\)/g)) {
        const spec = m[1];
        if (!spec.includes('assets/')) continue;
        found.add('assets/' + spec.split('assets/')[1]);
      }
    }
  };
  walk(join(ROOT, 'src'));
  return [...found];
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(full.slice(ROOT.length + 1).split(sep).join(posix.sep));
    }
  };
  walk(dir);
  return out;
}

describe('assetBundlePatterns', () => {
  it('bundles every asset the game actually requires', () => {
    const required = requiredAssets();
    // Sanity: the scan itself must be finding things, or this test proves
    // nothing. Deliberately loose — the count legitimately drops when art is
    // consolidated (packing 60 explosion frames into 6 sheets moved it by 54).
    expect(required.length).toBeGreaterThan(50);
    expect(required.filter((f) => !matches(f))).toEqual([]);
  });

  it('keeps every pre-bake source out of the shipping tree', () => {
    // Sources live in art-src/, never assets/ — see bake-bg-dim.mjs and
    // make-explosion-sheets.mjs. That boundary is what makes shipping them
    // structurally impossible rather than a matter of remembering, so guard
    // the boundary itself rather than any one directory.
    const sources = filesUnder(join(ROOT, 'art-src'));
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.filter(matches)).toEqual([]);
    expect(existsSync(join(ROOT, 'assets', 'background', 'original'))).toBe(false);
  });

  it('has no subdirectories under assets/ for sources to hide in', () => {
    // Every pattern is a single-level glob, so anything nested is silently
    // unbundled — which is exactly how the explosion sheets first went missing.
    // Keeping assets/ flat means the patterns cannot quietly stop covering it.
    const nested: string[] = [];
    for (const dir of readdirSync(join(ROOT, 'assets'))) {
      const full = join(ROOT, 'assets', dir);
      if (!statSync(full).isDirectory()) continue;
      for (const entry of readdirSync(full)) {
        if (statSync(join(full, entry)).isDirectory()) nested.push(`assets/${dir}/${entry}`);
      }
    }
    expect(nested).toEqual([]);
  });

  it('still bundles the icons, which are referenced from app.json not code', () => {
    for (const icon of ['assets/icon.png', 'assets/adaptive-icon.png', 'assets/splash-icon.png']) {
      expect(matches(icon)).toBe(true);
    }
  });
});
