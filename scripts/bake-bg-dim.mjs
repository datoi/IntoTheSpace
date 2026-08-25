// Bake the BG_DIM scrim into the background art.
//
// The game draws a #05070E quad at 0.42 over the whole sky every frame, purely
// to darken it so gameplay reads on top. That is a full-screen alpha blend, 60
// times a second, for the entire run — and because it is translucent it also
// forces everything beneath it to be drawn and read back. Baking the same
// darkening into the source pixels removes that pass permanently for zero
// runtime cost.
//
// Equivalent because darkening is affine and source-over is a convex
// combination, so the two commute — PROVIDED every image in the stack gets the
// same treatment (bases, wisp layers and planets alike). Miss one and it reads
// too bright against the others.
//
//   RGB' = (1 - BG_DIM) * RGB + BG_DIM * void      alpha untouched
//
// Alpha is deliberately left alone: the planets have soft transparent edges, and
// darkening their alpha would fill them in as dark discs. The arithmetic is done
// on sRGB bytes rather than linear light, because that is how the GPU blends —
// matching it is what makes this exact rather than approximate.
//
// Usage:
//   npm i -D sharp
//   node scripts/bake-bg-dim.mjs             # dry run, prints what it would do
//   node scripts/bake-bg-dim.mjs --write     # apply
//
// Originals live in art-src/background/ and every run re-derives from those —
// so running it twice cannot double-darken, and deleting the baked files and
// re-copying from art-src/ undoes it.
//
// They sit OUTSIDE assets/ deliberately. app.json's assetBundlePatterns has no
// negation, so anything under assets/ is one careless pattern edit away from
// being shipped — and these 6 MB of pre-bake source were in fact being bundled
// into the app for every user until that was caught. Keeping them out of the
// asset tree makes shipping them structurally impossible rather than a matter
// of remembering. src/game/__tests__/assetBundle.test.ts guards the boundary.

import { readdir, mkdir, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Keep these in step with src/game/constants.ts — BG_DIM and PALETTE.void.
const BG_DIM = 0.42;
const VOID = [0x05, 0x07, 0x0e];

// --- Per-file grade, applied BEFORE the dim ---------------------------------
//
// The dim is uniform on purpose: it replaces one specific runtime quad and must
// treat every image identically or the stack stops matching. This table is a
// different job — it corrects art that was not shot for this game.
//
//   hue         degrees to rotate. Recolours a set into a hue the catalogue
//               does not already own.
//   saturation  multiplier, applied with the rotation.
//   gamma/scale RGB' = 255 · (RGB/255)^gamma · scale. Fixes exposure.
//
// Anything absent is passed through untouched, which is most files.
//
// WHY EACH ENTRY EXISTS
//
// sbs_green — the SBS pack's tiles are not exposed consistently. Measured over
// the pristine sources, luminance p50 / p99: purple 17/45, blue 12/49, green
// 105/151. The green tile is an order of magnitude hotter and much flatter, so
// dropped in raw it drowns the play field. A plain multiply fixes the level but
// not the flatness — scaled to match on p50 it lands at p99 20, a dull uniform
// haze with no wisps. The gamma deepens the voids faster than the filaments,
// which is the "bright wisps over black" structure the other two already have;
// the scale then sets the level.
//
// bg0_* — the pack has three red hydrogen sets and the catalogue already ships
// one (bg2, Ember Reach, hue 14). bg0 measures hue 10, so at its native colour
// it is the same sky twice: it would fail the 30-degree separation the shop
// depends on, and wear chrome indistinguishable from Ember's. Rotated to ~320
// it becomes the one thing the catalogue has no version of — a rose nebula —
// and its blue star clusters land on cyan, which is a complement rather than a
// clash. Saturation is lifted because the rotation costs some on the way round.
// Its exposure needs nothing: 85 mean against Ember's 76.
//
// BOTH LAYERS OF A SET MUST CARRY THE SAME ROTATION. base and far are drawn on
// top of each other; rotating one and not the other tears the sky in half.
const GRADE = {
  'sbs_green.png': { gamma: 3.0, scale: 0.8 },
  'bg0_base.jpg': { hue: 310, saturation: 1.35 },
  'bg0_far.jpg': { hue: 310, saturation: 1.35 },
};

// --- Files this must NOT touch ----------------------------------------------
//
// The star veil is drawn by make-star-veil.mjs, which does not apply BG_DIM and
// never has. Its magnitude distribution was tuned by eye AGAINST the already
// baked backgrounds, so the brightness that shipped is the brightness someone
// chose while looking at the final composite.
//
// This glob would sweep it up anyway, and did: the first run of this script
// after the starfield landed rewrote both tiles, lifting their near-black RGB
// toward navy and dimming the stars themselves by 42%. Nothing failed and no
// test caught it - the only signal was two unexpected entries in git status.
//
// Whether the veil SHOULD carry the dim is a real question and not settled
// here. The arithmetic works either way (a convex combination commutes with the
// darkening, translucent layers included), so it is a judgement about how much
// stars ought to pop against a dimmed sky, not about correctness. Until someone
// makes that call deliberately, this script leaves them alone rather than
// changing shipped art as a side effect of baking something else.
const SKIP = new Set(['star_far.png', 'star_near.png']);

const DIR = 'assets/background';
// Pristine sources, kept outside assets/ so they can never be bundled — see the
// note at the top of this file.
const ORIG = 'art-src/background';
const WRITE = process.argv.includes('--write');

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

const keep = 1 - BG_DIM;
const add = VOID.map((c) => c * BG_DIM);

const files = (await readdir(DIR)).filter((f) => /\.(png|jpe?g)$/i.test(f) && !SKIP.has(f));
if (!files.length) {
  console.error(`no images found in ${DIR}`);
  process.exit(1);
}

console.log(
  `${WRITE ? 'Baking' : 'DRY RUN —'} RGB' = ${keep.toFixed(2)}·RGB + [${add
    .map((v) => v.toFixed(2))
    .join(', ')}]  (${files.length} files)\n`
);

if (WRITE) await mkdir(ORIG, { recursive: true });

for (const file of files) {
  const live = path.join(DIR, file);
  const backup = path.join(ORIG, file);

  // Always transform the pristine copy, never an already-baked file.
  if (WRITE && !(await exists(backup))) await copyFile(live, backup);
  const source = (await exists(backup)) ? backup : live;

  const grade = GRADE[file];
  const meta = await sharp(source).metadata();
  // 4-channel form only when there IS an alpha channel; the 1/0 pair passes it
  // through untouched. Sending four values to a 3-channel image throws.
  const mul = meta.hasAlpha ? [keep, keep, keep, 1] : [keep, keep, keep];
  const off = meta.hasAlpha ? [...add, 0] : [...add];

  console.log(
    `  ${file.padEnd(28)} ${meta.width}x${meta.height} ${meta.format}${
      meta.hasAlpha ? ' +alpha' : ''
    }${
      grade
        ? '  grade ' +
          [
            grade.hue !== undefined ? `hue+${grade.hue}` : null,
            grade.saturation !== undefined ? `sat×${grade.saturation}` : null,
            grade.gamma !== undefined ? `γ${grade.gamma}` : null,
            grade.scale !== undefined ? `×${grade.scale}` : null,
          ]
            .filter(Boolean)
            .join(' ')
        : ''
    }`
  );
  if (!WRITE) continue;

  // Reads the backup and writes the live file — never the same path, so no
  // temp-file dance is needed. Re-encoded in the same format; quality is high
  // and every run starts from the untouched original, so there is exactly one
  // generation of JPEG loss no matter how often this is run.
  // The grade runs FIRST, because it is correcting the source art; the dim is
  // then applied to the corrected pixels, so the result is still exactly what
  // the runtime quad would have produced over that art.
  //
  // Hue and saturation go through modulate(), which works in a perceptual space
  // and keeps the rotation looking like a recolour rather than a channel swap.
  // The exposure curve is per-channel, so it is done on raw bytes afterwards.
  let input = source;
  if (grade) {
    let pre = sharp(source);
    if (grade.hue !== undefined || grade.saturation !== undefined) {
      pre = pre.modulate({
        ...(grade.hue !== undefined ? { hue: grade.hue } : {}),
        ...(grade.saturation !== undefined ? { saturation: grade.saturation } : {}),
      });
    }
    if (grade.gamma !== undefined || grade.scale !== undefined) {
      const gamma = grade.gamma ?? 1;
      const scale = grade.scale ?? 1;
      const { data, info } = await pre.raw().toBuffer({ resolveWithObject: true });
      const chans = info.channels;
      for (let i = 0; i < data.length; i++) {
        // Leave alpha alone, for the same reason the dim does.
        if (meta.hasAlpha && i % chans === chans - 1) continue;
        const v = Math.pow(data[i] / 255, gamma) * scale;
        data[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
      }
      pre = sharp(data, { raw: { width: info.width, height: info.height, channels: chans } });
    }
    input = await pre.png().toBuffer();
  }

  const pipeline = sharp(input).linear(mul, off);
  const out = /\.png$/i.test(file)
    ? pipeline.png({ compressionLevel: 9 })
    : pipeline.jpeg({ quality: 92, mozjpeg: true });
  await out.toFile(live);
}

console.log(
  WRITE
    ? `\nDone. Originals in ${ORIG}/ — re-run any time, it always starts from those.`
    : `\nNothing written. Re-run with --write to apply.${
        files.length ? `\nSources read from ${ORIG}/ where present.` : ''
      }`
);
