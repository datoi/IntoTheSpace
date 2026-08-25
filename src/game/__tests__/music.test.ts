import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { BACKGROUNDS } from '../constants';
import { BG_MUSIC } from '../music';

/**
 * Guards the soundtrack table.
 *
 * The pairing lives in music.ts rather than on BackgroundDef, so nothing in
 * the type system ties the two together: a new sky can be added to
 * BACKGROUNDS, priced, themed, shipped — and be completely silent, with no
 * error anywhere. These tests are the only thing that notices.
 */

const ROOT = join(__dirname, '..', '..', '..');
const MUSIC_DIR = join(ROOT, 'assets', 'music');

describe('background music table', () => {
  it('gives every background exactly two tracks', () => {
    for (const bg of BACKGROUNDS) {
      const pair = BG_MUSIC[bg.id];
      expect(`${bg.id}: ${pair ? pair.length : 'missing'}`).toBe(`${bg.id}: 2`);
    }
  });

  it('has no entry for a background that does not exist', () => {
    const ids = new Set(BACKGROUNDS.map((b) => b.id));
    for (const id of Object.keys(BG_MUSIC)) {
      expect(`${id} is a real background: ${ids.has(id)}`).toBe(`${id} is a real background: true`);
    }
  });

  /**
   * Which file each sky plays, read from the SOURCE.
   *
   * Not from BG_MUSIC itself: under jest-expo every require() of an asset
   * resolves to the same placeholder id, so comparing the runtime values would
   * report all ten tracks as identical and any "these differ" assertion would
   * be testing the mock rather than the table. The same reason
   * assetBundle.test.ts scans source text for require() paths.
   */
  const pairsFromSource = (): Record<string, string[]> => {
    const src = readFileSync(join(ROOT, 'src', 'game', 'music.ts'), 'utf8');
    const table = src.slice(src.indexOf('export const BG_MUSIC'), src.indexOf('\n};', src.indexOf('export const BG_MUSIC')));
    const out: Record<string, string[]> = {};
    for (const line of table.split('\n')) {
      const key = line.match(/^\s*(\w+):\s*\[/);
      if (!key) continue;
      out[key[1]] = [...line.matchAll(/assets\/music\/([\w-]+)\.mp3/g)].map((m) => m[1]);
    }
    return out;
  };

  it('parsed the table it is about to check', () => {
    // If the parse silently returned nothing, every assertion below would pass
    // vacuously — which is worse than no test at all.
    const pairs = pairsFromSource();
    expect(Object.keys(pairs).sort()).toEqual(Object.keys(BG_MUSIC).sort());
    for (const [id, tracks] of Object.entries(pairs)) {
      expect(`${id}: ${tracks.length}`).toBe(`${id}: 2`);
    }
  });

  it('never plays the same track twice in one pair', () => {
    // Two identical halves would defeat the entire point of pairing them — the
    // rotation exists so nothing repeats inside ~65 seconds.
    for (const [id, tracks] of Object.entries(pairsFromSource())) {
      expect(`${id}: ${tracks.join(' + ')}`).toBe(
        tracks[0] !== tracks[1] ? `${id}: ${tracks.join(' + ')}` : `${id}: two different tracks`
      );
    }
  });

  it('never shares a track between two skies', () => {
    // Each sky's soundtrack is part of what a player is buying; a shared track
    // makes two purchases sound like one.
    const owner = new Map<string, string>();
    for (const [id, tracks] of Object.entries(pairsFromSource())) {
      for (const t of tracks) {
        expect(`${t} -> ${owner.get(t) ?? id}`).toBe(`${t} -> ${id}`);
        owner.set(t, id);
      }
    }
  });

  it('only names tracks that are actually bundled', () => {
    const shipped = new Set(readdirSync(MUSIC_DIR));
    for (const [id, tracks] of Object.entries(pairsFromSource())) {
      for (const t of tracks) {
        expect(`${id} -> ${t}.mp3 present: ${shipped.has(`${t}.mp3`)}`).toBe(
          `${id} -> ${t}.mp3 present: true`
        );
      }
    }
  });
});

describe('music assets', () => {
  const files = existsSync(MUSIC_DIR) ? readdirSync(MUSIC_DIR) : [];

  it('ships only mp3s, flat, as assetBundlePatterns expects', () => {
    // `assets/music/*.mp3` is a single-level glob: anything nested, or with
    // another extension, works in dev and silently does not ship.
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(f).toMatch(/^[^/\\]+\.mp3$/);
  });

  it('ships exactly the tracks the table plays', () => {
    // Every mp3 in assets/ costs ~620 KB of download whether or not anything
    // references it. The two tracks held back for the sixth sky live in
    // art-src/music/ for exactly this reason.
    const used = Object.values(BG_MUSIC).flat().length;
    expect(`${files.length} files for ${used} table slots`).toBe(`${used} files for ${used} table slots`);
  });

  it('bundles real audio, not truncated downloads', () => {
    // A zero-length or HTML-error-page "mp3" is a plausible way for a music
    // drop to go wrong, and it would present as one silent sky.
    for (const f of files) {
      const b = readFileSync(join(MUSIC_DIR, f));
      expect(`${f} bytes>100k: ${b.length > 100_000}`).toBe(`${f} bytes>100k: true`);
      // MPEG frame sync, or an ID3 tag ahead of it.
      const isMp3 = b.toString('ascii', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
      expect(`${f} is mp3: ${isMp3}`).toBe(`${f} is mp3: true`);
    }
  });
});
