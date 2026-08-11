// Build the star veil — the layer that puts the planets INTO space.
//
// --- The problem it solves ---------------------------------------------------
//
// Planets read as stickers on the lens, and no amount of resizing or fading
// fixes that, because the cue the eye actually uses is OCCLUSION: something has
// to pass between the viewer and the object. Nothing did. Every sky was one
// opaque layer with the planets drawn on top of it, so a planet was always the
// nearest thing on screen and the brain scored it accordingly.
//
// Reordering alone cannot fix it either: the existing layers are OPAQUE
// (sbs_stars_near.png has no alpha channel at all, the nebulae are drawn at
// alpha 1), so a planet moved behind them is not distant — it is invisible.
//
// Hence a veil: a sparse field of stars with REAL per-pixel alpha, drawn in
// front of the planets and drifting much faster than they do. Stars sliding
// across a planet's face is the whole trick.
//
// --- Why one shared file -----------------------------------------------------
//
// Stars are white. They do not need to match the nebula behind them, so all
// fourteen skies share one veil: one bitmap in memory instead of one per set,
// and one decode at boot.
//
// --- Cutting the alpha -------------------------------------------------------
//
// The source is a near-black frame with sparse bright points, so alpha is
// rebuilt from luminance: black becomes transparent, a star keeps its colour
// and brightness. FLOOR before GAIN, and the floor is the important half — the
// source carries a faint noise pedestal across the whole frame, and gaining
// that up turns 70% of the tile slightly opaque, which is a grey wash over the
// sky rather than stars.
//
// Usage:  node scripts/make-star-veil.mjs

import sharp from 'sharp';
import path from 'node:path';

const SRC = 'assets/background/sbs_stars_near.png';
const EXTRA = 'assets/background/sbs_stars_mid.png';
const OUT = 'assets/background/star_veil.png';

const TILE = 512;

/** Below this luminance is nothing — noise floor, not a star. */
const FLOOR = 9;
/** …and what is left is lifted, so a real star reaches full opacity. */
const GAIN = 6.0;

/**
 * Ceiling on how much of the veil may paint.
 *
 * A veil is a depth cue, not scenery. Past a few percent it stops reading as
 * "stars in front" and starts reading as fog over the whole play field, which
 * costs readability for nothing. Verified below rather than trusted.
 */
const MAX_COVERAGE = 0.06;

/** Rebuild alpha from luminance — see the note above. */
async function alphaCut(file, scale = 1) {
  const { data, info } = await sharp(file)
    .resize(TILE, TILE, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const px = info.width * info.height;
  const out = Buffer.alloc(px * 4);
  for (let i = 0; i < px; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = Math.max(0, Math.min(255, Math.round((lum - FLOOR) * GAIN * scale)));
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

// Two source fields stacked, the second dimmer and offset. One field alone is
// regular enough that the repeat is visible as the veil scrolls; two at
// different offsets break that up for no extra runtime cost — they are
// flattened into a single bitmap here.
const near = await alphaCut(SRC);

// Two passes, not one chained pipeline: sharp does not apply extend and extract
// in call order within a single pipeline, and chaining them silently yields the
// un-cropped 614x683 image (which then fails to composite).
const shifted = await sharp(await alphaCut(EXTRA, 0.6))
  .extend({
    top: Math.round(TILE / 3),
    left: Math.round(TILE / 5),
    bottom: 0,
    right: 0,
    extendWith: 'repeat',
  })
  .png()
  .toBuffer();
const mid = await sharp(shifted)
  .extract({ left: 0, top: 0, width: TILE, height: TILE })
  .png()
  .toBuffer();

const info = await sharp(near)
  .composite([{ input: mid, blend: 'over' }])
  .png({ compressionLevel: 9 })
  .toFile(OUT);

// --- Verify, because "looks like stars" is not something a build can assume ---
const { data } = await sharp(OUT).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let lit = 0;
let bright = 0;
for (let i = 3; i < data.length; i += 4) {
  if (data[i] > 8) lit++;
  if (data[i] > 200) bright++;
}
const px = TILE * TILE;
const coverage = lit / px;

console.log(`  ${path.basename(OUT)}  ${TILE}x${TILE}  ${(info.size / 1024).toFixed(0)}KB`);
console.log(`  painted ${(coverage * 100).toFixed(1)}%   full-brightness ${((bright / px) * 100).toFixed(2)}%`);

if (coverage > MAX_COVERAGE) {
  console.error(
    `\nFAILED: ${(coverage * 100).toFixed(1)}% of the veil paints, ceiling is ${MAX_COVERAGE * 100}%.` +
      `\nThat is a wash over the play field, not a starfield. Raise FLOOR.`
  );
  process.exit(1);
}
if (coverage < 0.002) {
  console.error(`\nFAILED: only ${(coverage * 100).toFixed(2)}% paints — too sparse to read. Lower FLOOR.`);
  process.exit(1);
}
console.log('\nWithin the readable band.');
