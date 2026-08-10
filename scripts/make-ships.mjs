// Build the player hulls and the bosses from the sprite packs.
//
// --- Five looks per hull -----------------------------------------------------
//
// The pack ships each body at five build levels — every step adds wings, guns
// and bulk — so a hull can visibly grow as the player invests in it. The game
// already computed a cosmetic tier from upgrade spend (visualTier) and then did
// nothing with it but print a number in the Hangar; this is what makes that
// number the ship you fly.
//
// --- Three bodies, five hulls ------------------------------------------------
//
// The pack has three bodies and the game has five hulls, each with its own
// ultimate and each individually PURCHASED. Cutting the roster to three would
// confiscate two owned ships and delete two specials, so two bodies are reused
// under a hue rotation instead. Rotation only — no recolouring by hand — so all
// five keep the pack's shading and read as one fleet.
//
// --- Every level fits the SAME box -------------------------------------------
//
// Source aspect ratios swing wildly (Ship_01 L1 is 1065x860, its L5 is
// 808x1683). Fitted into one square box, so a hull that levels up gains detail
// and silhouette WITHOUT gaining screen area — the collision box is a constant
// and an upgrade that quietly enlarged your own hitbox would be a punishment
// dressed as a reward.
//
// Usage:  node scripts/make-ships.mjs

import { mkdir, readdir } from 'node:fs/promises';
import { statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { rotationOnto } from './lib/hue.mjs';

const SHIP_SRC = 'art-src/ships';
const BOSS_SRC = 'art-src/bosses';
const AVATAR_OUT = 'assets/avatars';
const BOSS_OUT = 'assets/obstacles';

/**
 * Rendered at AVATAR_IMG_W/H (56x64), so 128 is ~2x for a retina panel. Bigger
 * is wasted bitmap: a 1000px source decodes to 4MB for something drawn at 56.
 */
const SHIP_PX = 128;
export const SHIP_LEVELS = 5;

/** Bosses draw at BOSS_MINI_VIS 104 and BOSS_GIANT_VIS 168 — again ~2x. */
const BOSS_MINI_PX = 224;
const BOSS_GIANT_PX = 352;

/**
 * Hull id -> source body, and the hue it must LAND ON (degrees, null = leave
 * the pack's own colour).
 *
 * A target, not an offset: a hand-picked offset is only meaningful against a
 * source hue nobody measured, and the first pass proved it — "specter" was
 * asked for violet and rendered green, "nova" for cyan and rendered pink. See
 * lib/hue.mjs; the rotation is measured and corrected instead.
 *
 * The bodies are blue (01), red (02) and gold (03). Colour follows what the
 * hull IS, because a fleet reads by silhouette and colour long before its name:
 * the armoured one is heavy red, the ghost is spectral violet, the predator
 * keeps the pack's gold.
 */
const HULLS = [
  { id: 'ironclad', body: '02', target: null }, // heavy red — armour, Bulwark
  { id: 'specter', body: '01', target: 285 }, // -> spectral violet, Phantom
  { id: 'raptor', body: '03', target: null }, // gold predator — Talons
  { id: 'valkyrie', body: '01', target: null }, // pack blue — Spears
  { id: 'nova', body: '03', target: 190 }, // -> white-hot cyan, Nova
];

/**
 * mini and giant. Boss_02 is deliberately unused for now — the game only has
 * two boss classes, and a third body is worth more held back for a future one
 * than spent making the existing pair inconsistent.
 */
const BOSSES = [
  { src: 'Boss_01', out: 'boss_mini.png', px: BOSS_MINI_PX },
  { src: 'Boss_03', out: 'boss_giant.png', px: BOSS_GIANT_PX },
];

/** Trim the transparent margin, fit inside a square box, centre it. */
const fitSquare = (img, px) =>
  img
    .trim()
    .resize(px, px, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });

await mkdir(AVATAR_OUT, { recursive: true });
await mkdir(BOSS_OUT, { recursive: true });

let shipBytes = 0;
for (const h of HULLS) {
  const sizes = [];
  // One rotation for the whole hull, derived from its FIRST level and reused
  // across the rest: the five levels are the same body, so measuring each
  // separately would let them drift apart in colour as they gain parts.
  let rotation = 0;
  let landed = null;
  if (h.target !== null) {
    const lvl1 = await fitSquare(sharp(path.join(SHIP_SRC, `Ship_${h.body}`, 'Ship_LVL_1.png')), SHIP_PX).toBuffer();
    ({ rotation, outHue: landed } = await rotationOnto(lvl1, h.target));
  }
  for (let lvl = 1; lvl <= SHIP_LEVELS; lvl++) {
    const src = path.join(SHIP_SRC, `Ship_${h.body}`, `Ship_LVL_${lvl}.png`);
    let img = fitSquare(sharp(src), SHIP_PX);
    if (rotation) img = img.modulate({ hue: rotation });
    const info = await img
      .png({ compressionLevel: 9 })
      .toFile(path.join(AVATAR_OUT, `${h.id}_l${lvl}.png`));
    shipBytes += info.size;
    sizes.push((info.size / 1024).toFixed(0));
  }
  console.log(
    `  ${h.id.padEnd(10)} body ${h.body}  ` +
      (h.target === null ? 'native hue    ' : `hue -> ${String(Math.round(landed)).padStart(3)} (want ${h.target})`) +
      `  L1-${SHIP_LEVELS}: ${sizes.join('/')}KB`
  );
}
console.log(
  `\n${HULLS.length} hulls x ${SHIP_LEVELS} levels at ${SHIP_PX}px — ` +
    `${(shipBytes / 1024).toFixed(0)}KB, ` +
    `${((SHIP_PX * SHIP_PX * 4 * SHIP_LEVELS) / 1048576).toFixed(2)}MB of bitmap per equipped hull.`
);

for (const b of BOSSES) {
  const info = await fitSquare(sharp(path.join(BOSS_SRC, b.src, 'Boss_Full.png')), b.px)
    .png({ compressionLevel: 9 })
    .toFile(path.join(BOSS_OUT, b.out));
  console.log(`  ${b.out.padEnd(16)} <- ${b.src} at ${b.px}px  ${(info.size / 1024).toFixed(0)}KB`);
}
