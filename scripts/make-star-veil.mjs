// Generate the starfield layers.
//
// --- Why these are drawn rather than cut from the pack -----------------------
//
// The first version alpha-cut a stock starfield tile by thresholding its
// luminance. That produced stars of near-uniform brightness at near-uniform
// spacing, which is the single clearest tell that a starfield is a texture: a
// real field is mostly stars you can barely see, with a scattering of bright
// ones. Thresholding throws exactly that information away — everything below
// the floor vanishes and everything above it saturates.
//
// Drawing them means the distribution is a decision instead of an accident.
//
// --- Why TWO layers, and why they are SLOW -----------------------------------
//
// The earlier veil moved at 0.45 against a 0.15 nebula: the entire starfield
// swept past three times faster than the sky behind it, which reads as a scrim
// sliding over the screen. That is backwards. Stars are the most distant things
// in the frame; they should be nearly the slowest.
//
// So the depth is rebuilt the other way round. Both fields drift slowly, close
// to the nebula's own rate, and the PLANETS are slowed further still so the
// stars gently overtake them instead of racing past. The occlusion cue survives
// — a star crossing a planet's face is what sells the distance — but it happens
// at a speed the eye reads as depth rather than as motion.
//
// Two fields at slightly different rates also give the starfield depth WITHIN
// itself, which one layer cannot do at any speed: real stars are not all the
// same distance away, and a single plane of them always looks like a plane.
//
//   star_far    dense, faint, tiny        speed 0.18  (behind the planets)
//   star_near   sparse, brighter, larger  speed 0.30  (in front of them)
//
// Usage:  node scripts/make-star-veil.mjs

import sharp from 'sharp';

const OUT = 'assets/background';
const TILE = 512;

/**
 * Deterministic RNG. The starfield must be identical on every machine and every
 * rebuild — a field that reshuffles when someone re-runs the script is a diff
 * nobody can review and a look nobody can tune.
 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LAYERS = [
  {
    file: 'star_far.png',
    seed: 20260812,
    count: 1150,
    // Radius in pixels. Sub-pixel on purpose: most real stars are point
    // sources, and a field where every star is a visible disc looks like
    // confetti. These are drawn with a soft falloff so a 0.6px star is a dim
    // smudge across two pixels rather than a hard dot.
    rMin: 0.45,
    rMax: 1.1,
    /**
     * Brightness follows a power law: `pow(random, MAG_POWER)`.
     *
     * This is the whole realism budget in one number. At 1 the field is a flat
     * spread of mid-grey dots — the stock-texture look. At 3.5 the great
     * majority are barely-there and a handful are bright, which is what a real
     * field is and what the eye reads as depth.
     */
    magPower: 3.6,
    maxBrightness: 0.55,
  },
  {
    file: 'star_near.png',
    seed: 99118822,
    // FAR fewer. This is the layer that crosses in front of the planets, and
    // nearby stars are rare — a dense fast field in front of everything is the
    // artificial "layer" look the previous version had.
    count: 110,
    rMin: 0.7,
    rMax: 1.5,
    magPower: 2.4,
    maxBrightness: 1.0,
  },
];

/**
 * Splat one star into an RGBA buffer with a soft radial falloff, wrapping at
 * the edges so the tile stays seamless.
 *
 * Gaussian-ish rather than a hard circle: a hard-edged dot at this size aliases
 * into a square, and a field of tiny squares is unmistakably synthetic.
 */
function splat(buf, cx, cy, radius, brightness, tint) {
  // Sigma is a FRACTION of the radius, not the radius itself. Using the radius
  // directly spreads a bright star across a ~10px smudge, and a field of soft
  // blobs reads as dust on the lens rather than as points of light. A tight
  // core with a short tail is what a star looks like.
  const sigma = radius * 0.55;
  const reach = Math.ceil(radius * 2) + 1;
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const d = Math.hypot(dx, dy);
      const fall = Math.exp(-(d * d) / (2 * sigma * sigma));
      if (fall < 0.004) continue;
      // Wrap: a star near an edge continues on the opposite side, so the tile
      // repeats without a visible grid of gaps between copies.
      const x = (((Math.round(cx) + dx) % TILE) + TILE) % TILE;
      const y = (((Math.round(cy) + dy) % TILE) + TILE) % TILE;
      const i = (y * TILE + x) * 4;
      const a = Math.min(255, Math.round(fall * brightness * 255));
      if (a <= buf[i + 3]) continue; // keep the brighter of overlapping stars
      buf[i] = tint[0];
      buf[i + 1] = tint[1];
      buf[i + 2] = tint[2];
      buf[i + 3] = a;
    }
  }
}

/**
 * Star colour. Real stars run blue-white through yellow to orange, and the
 * cool ones dominate at these magnitudes — but the spread is kept narrow
 * because a rainbow starfield looks like a bug, not like astronomy.
 */
function starTint(r) {
  const t = r();
  if (t < 0.72) return [235, 242, 255]; // blue-white, the common case
  if (t < 0.9) return [255, 250, 235]; // warm white
  if (t < 0.97) return [255, 232, 200]; // pale gold
  return [255, 214, 196]; // faint orange, rare
}

for (const L of LAYERS) {
  const r = rng(L.seed);
  const buf = Buffer.alloc(TILE * TILE * 4); // zeroed = fully transparent

  for (let i = 0; i < L.count; i++) {
    const brightness = Math.pow(r(), L.magPower) * L.maxBrightness;
    // Skip the ones that rounded away to nothing rather than writing invisible
    // pixels that still cost alpha coverage.
    if (brightness < 0.012) continue;
    // Radius correlates with brightness — a bright star reads bigger because it
    // bleeds into its neighbours, and decoupling the two makes the field look
    // like scattered pixels rather than light.
    const radius = L.rMin + (L.rMax - L.rMin) * Math.pow(brightness / L.maxBrightness, 0.6);
    splat(buf, r() * TILE, r() * TILE, radius, brightness, starTint(r));
  }

  const info = await sharp(buf, { raw: { width: TILE, height: TILE, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/${L.file}`);

  // --- Verify, because "looks like stars" is not something a build assumes ---
  let painted = 0;
  let bright = 0;
  for (let i = 3; i < buf.length; i += 4) {
    if (buf[i] > 6) painted++;
    if (buf[i] > 180) bright++;
  }
  const px = TILE * TILE;
  const cover = (painted / px) * 100;
  const brightPct = (bright / px) * 100;
  console.log(
    `  ${L.file.padEnd(14)} ${L.count} stars  ${(info.size / 1024).toFixed(0)}KB  ` +
      `painted ${cover.toFixed(2)}%  bright ${brightPct.toFixed(3)}%`
  );

  // A field this sparse is the point; these bounds catch a tuning slip that
  // would turn it back into a grey wash (too high) or nothing (too low).
  if (cover > 4) {
    console.error(`\nFAILED: ${L.file} paints ${cover.toFixed(2)}% — that is a wash, not a field.`);
    process.exit(1);
  }
  if (cover < 0.05) {
    console.error(`\nFAILED: ${L.file} paints only ${cover.toFixed(2)}% — nothing to see.`);
    process.exit(1);
  }
  // The signature of a real field: the bright ones are a small fraction of the
  // painted ones. If this ratio climbs, magPower has gone flat and the field
  // is back to uniform dots.
  if (bright / Math.max(1, painted) > 0.12) {
    console.error(`\nFAILED: ${L.file} is too uniformly bright — raise magPower.`);
    process.exit(1);
  }
}

console.log('\nBoth fields within the readable band.');
