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

const files = (await readdir(DIR)).filter((f) => /\.(png|jpe?g)$/i.test(f));
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

  const meta = await sharp(source).metadata();
  // 4-channel form only when there IS an alpha channel; the 1/0 pair passes it
  // through untouched. Sending four values to a 3-channel image throws.
  const mul = meta.hasAlpha ? [keep, keep, keep, 1] : [keep, keep, keep];
  const off = meta.hasAlpha ? [...add, 0] : [...add];

  console.log(
    `  ${file.padEnd(28)} ${meta.width}x${meta.height} ${meta.format}${meta.hasAlpha ? ' +alpha' : ''}`
  );
  if (!WRITE) continue;

  // Reads the backup and writes the live file — never the same path, so no
  // temp-file dance is needed. Re-encoded in the same format; quality is high
  // and every run starts from the untouched original, so there is exactly one
  // generation of JPEG loss no matter how often this is run.
  const pipeline = sharp(source).linear(mul, off);
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
