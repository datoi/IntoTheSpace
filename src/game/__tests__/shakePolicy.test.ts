import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guards what camera shake is ALLOWED TO MEAN.
 *
 * Shake used to fire from eight places: taking a hit, a shield save, every
 * enemy death, every boss death, an explosive elite's parting burst, the bomb,
 * every special activation and Nova. During a busy wave that is very nearly
 * continuous, and a camera that is always moving communicates nothing — the one
 * event the player genuinely needs to feel, losing a heart, was buried in the
 * scenery it shared a channel with.
 *
 * So shake now means exactly one thing: DAMAGE ARRIVED AT THE HULL — whether it
 * landed or was absorbed by a shield. Kills are sold by hit-stop, particles, the
 * pitch ladder and the explosion sprite; none of those compete with damage for
 * the same channel.
 *
 * This is a policy, not an implementation detail, and policies decay silently —
 * re-adding `s.shake` to a satisfying explosion is a very natural thing for a
 * future change to do, and nothing else in the suite would notice. Hence a
 * source scan, in the same spirit as assetBundle.test.ts.
 *
 * If this fails because you INTENDED to add a shake source, the question to
 * answer first is whether the new event is the player being damaged. If it
 * isn't, spend hit-stop or a flash instead — and if it is, update the list.
 */

const GAME_SCREEN = join(__dirname, '..', '..', 'screens', 'GameScreen.tsx');
const src = readFileSync(GAME_SCREEN, 'utf8');

/** Every line that WRITES to the shake field, ignoring the per-frame decay. */
const assignments = src
  .split('\n')
  .map((line, i) => ({ line: line.trim(), no: i + 1 }))
  .filter(({ line }) => /\bs\.shake\s*=/.test(line))
  // The decay in update() is the one write that isn't a shake SOURCE.
  .filter(({ line }) => !line.includes('Math.max(0, s.shake - dt)'));

describe('camera shake means damage, and only damage', () => {
  it('has exactly two shake sources, both of them damage reaching the hull', () => {
    // One for a heart lost, one for a shot a shield ate. Nothing else.
    expect(assignments).toHaveLength(2);
  });

  it('keeps the offensive paths free of it', () => {
    // `explode` (an explosive elite's parting burst), `detonate` (the bomb) and
    // `fireSpecial` (every ultimate, including Nova) each used to shake. They
    // are the three the player TRIGGERS, so they are the three most likely to
    // have a shake added back for feel.
    for (const fn of ['const explode =', 'const detonate =', 'const fireSpecial =']) {
      const start = src.indexOf(fn);
      expect(start).toBeGreaterThan(-1);
      expect(src.slice(start, start + 6000)).not.toMatch(/\bs\.shake\s*=/);
    }
  });

  it('still shakes when a heart is lost, and when a shield eats a shot', () => {
    // Matched on the CONSTANT NAMES, not their values. An earlier version of
    // this guard pinned the literal 0.28, which meant the obvious cleanup —
    // replacing the magic number with SHAKE_MAX, which is what CLAUDE.md asks
    // for — failed the suite. A guard that forbids the correct refactor is
    // worse than no guard.
    expect(src).toMatch(/s\.shake\s*=\s*SHAKE_MAX\b/);
    expect(src).toMatch(/s\.shake\s*=\s*Math\.max\(s\.shake,\s*SHAKE_ABSORB\)/);
  });
});
