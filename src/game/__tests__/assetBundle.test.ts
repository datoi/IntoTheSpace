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
    // Sanity: the scan itself must be finding things, or this test proves nothing.
    expect(required.length).toBeGreaterThan(100);
    expect(required.filter((f) => !matches(f))).toEqual([]);
  });

  it('keeps the pre-bake source art out of the shipping tree entirely', () => {
    // The originals live in art-src/, not assets/ — see bake-bg-dim.mjs. That
    // is what makes shipping them structurally impossible rather than a matter
    // of remembering to exclude them, so guard the boundary itself.
    const originals = filesUnder(join(ROOT, 'art-src', 'background'));
    expect(originals.length).toBeGreaterThan(0);
    expect(originals.filter(matches)).toEqual([]);
    expect(existsSync(join(ROOT, 'assets', 'background', 'original'))).toBe(false);
  });

  it('has no subdirectories under assets/background to hide sources in', () => {
    const stray = readdirSync(join(ROOT, 'assets', 'background')).filter((e) =>
      statSync(join(ROOT, 'assets', 'background', e)).isDirectory()
    );
    expect(stray).toEqual([]);
  });

  it('still bundles the icons, which are referenced from app.json not code', () => {
    for (const icon of ['assets/icon.png', 'assets/adaptive-icon.png', 'assets/splash-icon.png']) {
      expect(matches(icon)).toBe(true);
    }
  });
});
