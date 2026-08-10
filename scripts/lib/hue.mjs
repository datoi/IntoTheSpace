// Rotate artwork onto a hue you can NAME.
//
// `sharp`'s modulate({ hue }) applies a rotation in a perceptual space, so the
// shift a pixel receives is not the shift requested. Computing an offset from a
// source hue therefore lands somewhere near the target at best: it produced a
// background called "crimson" that rendered green, and a hull meant to be
// spectral violet that came out teal.
//
// So don't compute — measure, apply, measure again, correct. Converges in two
// or three passes and is immune to however the underlying space behaves.

import sharp from 'sharp';

/**
 * Dominant hue of an image, in degrees.
 *
 * Weighted by saturation AND value, because most of a space sprite (or a
 * nebula) is near-black pixels whose hue is meaningless noise — average those
 * unweighted and the answer is arbitrary. Summed as unit vectors so hues either
 * side of 0° do not cancel to 180°.
 */
export async function dominantHue(input) {
  const { data, info } = await sharp(input)
    .resize(64, 64, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let x = 0;
  let y = 0;
  for (let i = 0; i < info.width * info.height; i++) {
    const a = data[i * 4 + 3];
    if (a < 128) continue; // transparent margin carries no colour
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (d < 0.02) continue; // greys have no hue to average
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
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Signed shortest angular distance from a to b, in degrees. */
export const hueDelta = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;

/**
 * The rotation that actually lands `input` on `target`.
 *
 * Returns the number to hand to modulate({ hue }), found by iteration. `apply`
 * lets a caller include whatever else it does to the pixels (saturation, for
 * instance) so the measurement is taken on the finished image rather than an
 * intermediate one.
 */
export async function rotationOnto(input, target, apply = (img, hue) => img.modulate({ hue })) {
  const srcHue = await dominantHue(input);
  let rotation = Math.round((target - srcHue + 360) % 360);
  let outHue = await dominantHue(await apply(sharp(input), rotation).toBuffer());

  for (let pass = 0; pass < 4 && Math.abs(hueDelta(outHue, target)) > 6; pass++) {
    rotation = Math.round((rotation + hueDelta(outHue, target) + 360) % 360);
    outHue = await dominantHue(await apply(sharp(input), rotation).toBuffer());
  }
  return { rotation, srcHue, outHue };
}
