// Build the playable sky from the SBS seamless tiles.
//
// --- What this produces, and why it is shaped this way -----------------------
//
// Two files per background, and only two, because every full-screen layer the
// game draws costs the same fill every frame whether the board is empty or
// carrying a boss — the sky is the largest SUSTAINED cost in the game.
//
//   bg_<id>_base.jpg    opaque. The nebula with a FAR starfield already baked
//                       into it, dimmed by BG_DIM. One draw, no alpha, no blend.
//   bg_<id>_stars.png   the NEAR starfield, alpha-cut so only the stars paint.
//
// Baking the far stars is the trick that buys depth for free: two star fields
// are visible, but only one of them costs a per-frame alpha composite. The
// baked one cannot parallax independently — and it does not need to, because at
// the distance it is meant to read as, it would barely move anyway.
//
// The result is CHEAPER than what it replaces (a 720x1280 base was 3.5MB of
// bitmap; a 512 seamless tile is 1MB) while showing more.
//
// --- Alpha-cutting the stars -------------------------------------------------
//
// The source starfields are near-black frames with sparse bright points
// (measured mean luminance 0.4–3.3 out of 255). Drawn as-is at partial opacity
// they would grey the whole sky down; what is wanted is the stars ONLY. So the
// alpha channel is rebuilt from luminance: black becomes transparent, a star
// keeps its colour and its brightness. That is what lets a star layer sit over
// a nebula without washing it out, and it is why the layers in the other pack
// (fully opaque 1920x1080 frames) were not usable for this.
//
// --- Colour ------------------------------------------------------------------
//
// The pack ships three nebula hues. Rotating hue on the source expands those
// into a full shop's worth of distinct skies at no extra bundle cost — the
// alternative was shipping three, or shipping 60MB of someone else's PNGs.
//
// Usage:  node scripts/make-backgrounds.mjs

import { mkdir, readdir } from 'node:fs/promises';
import { statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC = 'art-src/background-src';
const OUT = 'assets/background';

/** Keep in step with BG_DIM in constants.ts. */
const BG_DIM = 0.42;
const VOID = [0x05, 0x07, 0x0e];

/** Tile size. Seamless, square, and small — 512² decodes to 1MB, 720x1280 to 3.5. */
const TILE = 512;

/**
 * How hard the baked far-starfield reads. Low: it is depth, not decoration, and
 * anything brighter competes with the near layer that actually moves.
 */
const FAR_STAR_ALPHA = 0.55;

/**
 * Levels applied to luminance when rebuilding a star layer's alpha.
 *
 * FLOOR first, then GAIN, and the floor is the important half. Several of the
 * source tiles carry a very faint noise pedestal across the whole frame — dim
 * enough to be invisible on its own, but gain it up and 70% of the tile becomes
 * slightly opaque, which is a grey wash over the nebula rather than stars. The
 * floor drops that pedestal to fully transparent; the gain then takes the
 * genuine points to full opacity instead of a ghostly 30%.
 *
 * Verified by counting: a good layer lands near 1–8% of pixels visible. If a
 * regenerated tile reads much above that, the floor is too low for that source.
 */
const STAR_FLOOR = 7;
const STAR_ALPHA_GAIN = 5.0;

/**
 * Luminance window a finished base must land in.
 *
 * Some sources are so dark that hue-rotating and then dimming leaves a sky that
 * is functionally black — the "void" set measured 2.6 out of 255. Rather than
 * hand-tuning each one, anything below this is lifted to it. Deliberately low:
 * gameplay has to read on top, so the sky is meant to be dark, just not absent.
 */
const MIN_BASE_LUM = 9;
/**
 * …and the ceiling, which matters more. Gameplay reads ON TOP of the sky: a
 * bright nebula behind a bullet pattern is a readability failure, not a pretty
 * background. Anything above this is pulled back down.
 */
const MAX_BASE_LUM = 18;

/**
 * Atmospheric perspective, applied to every planet.
 *
 * Distance does two things to colour that a raw sprite does not have: it drains
 * saturation and it lowers contrast toward the colour of the medium in front.
 * Without them a planet is a bright, saturated, hard-edged disc sitting on a
 * dim desaturated sky, and no amount of repositioning stops it reading as a
 * sticker — which is exactly how the first pass looked.
 *
 * Applied to the ART rather than at runtime because a tint is free in a
 * pre-pass and a per-frame blend is not. The per-sky `opacity` in the catalog
 * then fine-tunes on top of this.
 */
const PLANET_SATURATION = 0.5;
const PLANET_BRIGHTNESS = 0.72;
/** Rendered size. 512 sources for something drawn ~120px is pure waste. */
const PLANET_PX = 192;

/**
 * The shop. Each entry is one buyable sky.
 *
 * `target` is the hue the finished sky must LAND ON, in degrees, not an offset
 * to apply. The first pass used hand-picked offsets and produced a sky called
 * "crimson" that rendered green — an offset is only meaningful relative to a
 * source hue nobody had measured. So the source is measured and the rotation is
 * derived, which makes the name a guarantee rather than a hope.
 *
 * `sat` scales saturation. Below 1 for the cold, empty skies, where a saturated
 * nebula reads as a colour swatch rather than as space.
 */
const SETS = [
  // --- starter -------------------------------------------------------------
  { id: 'violet', nebula: 'Purple_Nebula_02', stars: 'Starfield_05', target: 280, sat: 0.9 },
  // --- the rest. Order here is irrelevant: this script generates files by
  // id, and the shop ladder (order and price) lives in BACKGROUNDS. -------
  { id: 'azure', nebula: 'Blue_Nebula_01', stars: 'Starfield_03', target: 210, sat: 0.9 },
  { id: 'verdant', nebula: 'Green_Nebula_03', stars: 'Starfield_01', target: 135, sat: 0.8 },
  { id: 'teal', nebula: 'Blue_Nebula_03', stars: 'Starfield_05', target: 178, sat: 0.85 },
    // Saturation pulled hard: a magenta at this density reads far brighter
  // than its mean luminance suggests, and it was drowning the play field.
  { id: 'quartz', nebula: 'Purple_Nebula_06', stars: 'Starfield_03', target: 330, sat: 0.4 },
  { id: 'ember', nebula: 'Purple_Nebula_04', stars: 'Starfield_06', target: 25, sat: 0.85 },
  { id: 'gold', nebula: 'Green_Nebula_06', stars: 'Starfield_07', target: 45, sat: 0.7 },
  { id: 'toxic', nebula: 'Green_Nebula_02', stars: 'Starfield_08', target: 95, sat: 0.85 },
  { id: 'ion', nebula: 'Blue_Nebula_08', stars: 'Starfield_01', target: 195, sat: 0.85 },
  { id: 'aurora', nebula: 'Green_Nebula_05', stars: 'Starfield_06', target: 155, sat: 0.6 },
  { id: 'crimson', nebula: 'Blue_Nebula_05', stars: 'Starfield_02', target: 355, sat: 0.8 },
  { id: 'magma', nebula: 'Purple_Nebula_08', stars: 'Starfield_02', target: 18, sat: 0.8 },
  // The two sparse ones: nearly no nebula, so saturation is pulled right down —
  // what little colour there is should read as cold emptiness, not as a tint.
  { id: 'abyss', nebula: 'Blue_Nebula_07', stars: 'Starfield_04', target: 220, sat: 0.35 },
  { id: 'void', nebula: 'Starfield_04', stars: 'Starfield_07', target: 230, sat: 0.25 },
];

/**
 * The dominant hue of a tile, in degrees.
 *
 * Weighted by saturation AND luminance, because a nebula is mostly near-black
 * pixels whose hue is meaningless noise — an unweighted average of those returns
 * roughly nothing and the rotation lands anywhere. Averaged as unit vectors, so
 * hues either side of 0 do not cancel to 180.
 */
async function dominantHue(buf) {
  const { data, info } = await sharp(buf).resize(64, 64).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let x = 0, y = 0;
  for (let i = 0; i < info.width * info.height; i++) {
    const r = data[i * 3] / 255, g = data[i * 3 + 1] / 255, b = data[i * 3 + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d < 0.02) continue;
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
    const w = d * max; // saturation x brightness
    x += Math.cos((h * Math.PI) / 180) * w;
    y += Math.sin((h * Math.PI) / 180) * w;
  }
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

const srcPath = (stem) => path.join(SRC, `${stem}-512x512.png`);

/** Rebuild a tile's alpha from its own luminance — see the note above. */
async function alphaCutStars(stem) {
  const { data, info } = await sharp(srcPath(stem))
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
    // Rec. 601 luma — matches how the eye weights a star's brightness.
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    // Floor before gain: kill the noise pedestal, then lift what is left.
    out[i * 4 + 3] = Math.max(
      0,
      Math.min(255, Math.round((lum - STAR_FLOOR) * STAR_ALPHA_GAIN))
    );
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } });
}

await mkdir(OUT, { recursive: true });

const have = new Set((await readdir(SRC)).map((f) => f.replace('-512x512.png', '')));
let total = 0;

for (const s of SETS) {
  for (const stem of [s.nebula, s.stars]) {
    if (!have.has(stem)) {
      console.error(`missing source tile: ${stem} (looked in ${SRC})`);
      process.exit(1);
    }
  }

  // --- base: nebula rotated onto its TARGET hue, far starfield baked in ----
  //
  // Iterated, not computed once. `modulate({hue})` rotates in a perceptual
  // space, so the shift a pixel actually receives is not the shift requested —
  // a single computed rotation left "gold" landing on pink and "magma" on
  // olive. Measuring the RESULT and re-rotating by the residual converges in a
  // couple of passes and is immune to however the underlying space behaves.
  const raw = await sharp(srcPath(s.nebula)).resize(TILE, TILE, { fit: 'fill' }).removeAlpha().toBuffer();
  const srcHue = await dominantHue(raw);
  /** Signed shortest angular distance a→b, in degrees. */
  const delta = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;

  let rotation = Math.round((s.target - srcHue + 360) % 360);
  let nebula = await sharp(raw).modulate({ hue: rotation, saturation: s.sat }).toBuffer();
  let outHue = await dominantHue(nebula);
  for (let pass = 0; pass < 3 && Math.abs(delta(outHue, s.target)) > 6; pass++) {
    rotation = Math.round((rotation + delta(outHue, s.target) + 360) % 360);
    nebula = await sharp(raw).modulate({ hue: rotation, saturation: s.sat }).toBuffer();
    outHue = await dominantHue(nebula);
  }

  const farStars = await (await alphaCutStars(s.stars))
    .composite([
      // Knock the baked field back so it reads as distance rather than as a
      // second, equally-close layer competing with the one that moves.
      {
        input: Buffer.from([255, 255, 255, Math.round(255 * FAR_STAR_ALPHA)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();

  // BG_DIM baked in, exactly as bake-bg-dim.mjs did: darkening is affine and
  // source-over is a convex combination, so doing it here is equivalent to a
  // full-screen scrim at runtime and costs nothing per frame.
  const dimmed = await sharp(nebula)
    .composite([{ input: farStars, blend: 'over' }])
    .linear(
      [1 - BG_DIM, 1 - BG_DIM, 1 - BG_DIM],
      VOID.map((c) => c * BG_DIM)
    )
    .toBuffer();

  // Rescue a sky that dimming has left effectively black — see MIN_BASE_LUM.
  const st = await sharp(dimmed).stats();
  const [mr, mg, mb] = st.channels.slice(0, 3).map((c) => c.mean);
  const lum = 0.299 * mr + 0.587 * mg + 0.114 * mb;
  const target = Math.max(MIN_BASE_LUM, Math.min(MAX_BASE_LUM, lum));
  const lift = target / Math.max(lum, 0.5);

  const basePath = path.join(OUT, `bg_${s.id}_base.jpg`);
  const baseInfo = await sharp(dimmed)
    .linear([lift, lift, lift], [0, 0, 0])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(basePath);

  // --- near stars: the one layer that actually parallaxes ------------------
  const starsPath = path.join(OUT, `bg_${s.id}_stars.png`);
  const starsInfo = await (await alphaCutStars(s.stars))
    // A different tile offset from the baked copy, so the two fields are not
    // the same constellation sliding over itself. Whole pixels — and the tile
    // is seamless, so wrapping it by any offset is still seamless.
    .extend({
      top: Math.round(TILE / 3),
      left: Math.round(TILE / 4),
      bottom: 0,
      right: 0,
      extendWith: 'repeat',
    })
    .extract({ left: 0, top: 0, width: TILE, height: TILE })
    .png({ compressionLevel: 9 })
    .toFile(starsPath);

  total += baseInfo.size + starsInfo.size;
  console.log(
    `  ${s.id.padEnd(9)} base ${(baseInfo.size / 1024).toFixed(0).padStart(4)}KB   ` +
      `stars ${(starsInfo.size / 1024).toFixed(0).padStart(4)}KB   ` +
      `${String(Math.round(srcHue)).padStart(3)}->${String(s.target).padStart(3)}deg  lum ${(lum * lift).toFixed(1).padStart(4)}`
  );
}

console.log(
  `\n${SETS.length} skies, ${(total / 1024 / 1024).toFixed(1)}MB on disk, ` +
    `${((TILE * TILE * 4 * 2) / 1024 / 1024).toFixed(1)}MB of bitmap per sky in play.`
);
console.log('Set ids must match BACKGROUNDS in constants.ts.');

// --- Planets: pushed back by distance ----------------------------------------
const PLANET_SRC = 'art-src/planets';
let planetTotal = 0;
const planetFiles = (await readdir(PLANET_SRC)).filter((f) => /^planet_.*\.png$/.test(f));
for (const f of planetFiles) {
  const info = await sharp(path.join(PLANET_SRC, f))
    .resize(PLANET_PX, PLANET_PX, { fit: 'inside' })
    .modulate({ saturation: PLANET_SATURATION, brightness: PLANET_BRIGHTNESS })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, f));
  planetTotal += info.size;
}
console.log(
  `\n${planetFiles.length} planets at ${PLANET_PX}px, ` +
    `saturation x${PLANET_SATURATION}, brightness x${PLANET_BRIGHTNESS} ` +
    `— ${(planetTotal / 1024).toFixed(0)}KB.`
);
