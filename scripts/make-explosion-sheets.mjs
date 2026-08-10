// Pack each explosion's ten frames into one horizontal sprite sheet.
//
// --- Why ---------------------------------------------------------------------
//
// A death animation was ten separate PNGs stepped by swapping an <Image>'s
// `source` prop, ten times across 0.45s. With MAX_EXPLOSIONS concurrent that is
// roughly 180 source changes a second, and every one goes through the native
// image pipeline — a cache lookup and a texture bind even on a hit. It peaks
// exactly when many enemies die at once, which is the frame least able to
// afford it, and it was the last measurable stutter left in the game.
//
// A sheet removes the swap entirely. The <Image> is mounted once with ONE
// source that never changes; the frame is chosen by translating the strip
// inside a clip, which is a transform — the only thing a view can change
// without re-running layout or touching the image pipeline.
//
// It also cuts boot work hard: 60 preloaded images become 6, and the loading
// screen was mounting all of them for simultaneous decode.
//
// --- Layout ------------------------------------------------------------------
//
// One row, frames left to right, each FRAME px square, in the order the
// animation plays. The renderer relies on that being exact — frame N sits at
// x = N * FRAME — so this script is the source of truth for the packing and
// EXPLOSION_FRAMES in constants.ts must agree with it.
//
// Sources live in art-src/effects/ and the sheets are written into assets/.
// Same split as bake-bg-dim.mjs and for the same reason: only the packed sheet
// ships, and keeping the sixty loose frames outside assets/ makes bundling them
// structurally impossible rather than a matter of remembering to exclude them.
//
// Usage:  node scripts/make-explosion-sheets.mjs

import { readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SRC = 'art-src/effects';
const OUT = 'assets/effects';
/** Per-frame size in the sheet. Matches the source art; see EXPLOSION_VIS. */
const FRAME = 192;

// Colour families, in the order EXPLOSIONS declares them — the style index the
// game stores on a live explosion indexes into this, so the ORDER IS LOAD
// BEARING. Keep it in step with constants.ts.
const STYLES = ['crimson', 'green', 'teal', 'aqua', 'cyan', 'fire'];

const files = await readdir(SRC);
await mkdir(OUT, { recursive: true });

let total = 0;
for (const [i, style] of STYLES.entries()) {
  const frames = files
    .filter((f) => new RegExp(`^exp_${style}_\\d+\\.png$`).test(f))
    .sort(); // zero-padded, so lexical order IS frame order

  if (!frames.length) {
    console.error(`no frames found for style "${style}" — expected exp_${style}_NN.png`);
    process.exit(1);
  }

  // Resized rather than assumed: a single off-size source would silently shift
  // every later frame in the strip and the animation would drift sideways.
  const tiles = await Promise.all(
    frames.map(async (f, n) => ({
      input: await sharp(path.join(SRC, f)).resize(FRAME, FRAME, { fit: 'fill' }).png().toBuffer(),
      left: n * FRAME,
      top: 0,
    }))
  );

  const out = path.join(OUT, `exp_${style}.png`);
  const info = await sharp({
    create: {
      width: FRAME * frames.length,
      height: FRAME,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(tiles)
    .png({ compressionLevel: 9 })
    .toFile(out);

  total += info.size;
  console.log(
    `  [${i}] ${style.padEnd(8)} ${frames.length} frames  ${FRAME * frames.length}x${FRAME}  ${(info.size / 1024).toFixed(0)}KB`
  );
}

console.log(`\n${STYLES.length} sheets, ${(total / 1024).toFixed(0)}KB total.`);
console.log('Frame count per sheet must equal EXPLOSION_FRAMES in constants.ts.');
