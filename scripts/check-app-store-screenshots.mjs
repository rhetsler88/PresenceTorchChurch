/**
 * Check images against what App Store Connect accepts, and say which slot each
 * one belongs in.
 *
 * Point it at the file you are about to drag into the browser: a screenshot
 * that was re-saved, re-encoded, or downloaded from a preview often is not the
 * file that was exported, and this is the fastest way to tell.
 *
 * Usage:
 *   npm run check:app-store-screenshots                 # everything we ship
 *   npm run check:app-store-screenshots -- ~/Desktop    # a folder
 *   npm run check:app-store-screenshots -- shot.jpg     # one file
 */
import { readdirSync, statSync } from "fs";
import { dirname, extname, join, resolve } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

import { findSlot, findUploadProblems, SLOTS } from "../src/lib/appStoreScreenshotSpec.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shotRoot = join(__dirname, "..", "assets", "app-store-screenshots");

/** The slot folders only: the source masters next to them are inputs, not uploads. */
const defaultTargets = SLOTS.map((slot) => join(shotRoot, slot.dir));

/**
 * Wider than what Apple accepts on purpose: a WebP or HEIC saved out of a
 * browser is the failure worth reporting, not the one worth skipping.
 */
const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".avif", ".heic", ".heif", ".gif", ".bmp", ".tif", ".tiff",
]);

function collectImages(target) {
  // A path named outright is always checked; only directory walks get filtered.
  if (statSync(target).isFile()) return [target];
  return readdirSync(target)
    .map((name) => join(target, name))
    .flatMap((path) => (statSync(path).isDirectory() ? collectImages(path) : path))
    .filter((path) => IMAGE_EXTENSIONS.has(extname(path).toLowerCase()))
    .sort();
}

const targets = process.argv.slice(2).map((arg) => resolve(arg));
const files = (targets.length ? targets : defaultTargets).flatMap(collectImages);

if (files.length === 0) {
  console.error("No JPG or PNG files found.");
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const bytes = statSync(file).size;
  let meta;
  try {
    meta = await sharp(file).metadata();
  } catch {
    failed++;
    console.log(`FAIL  ${file}\n        ${Math.round(bytes / 1024)}KB\n        - could not be read as an image at all`);
    continue;
  }
  const problems = findUploadProblems({ ...meta, bytes });
  const size = `${meta.width}x${meta.height}`;
  const kb = `${Math.round(bytes / 1024)}KB`;

  if (problems.length === 0) {
    const slot = findSlot(meta.width, meta.height);
    console.log(`OK    ${file}\n        ${size} ${meta.format} ${kb} -> ${slot.label}`);
    continue;
  }

  failed++;
  console.log(`FAIL  ${file}\n        ${size} ${meta.format} ${kb}`);
  for (const problem of problems) console.log(`        - ${problem}`);
}

console.log(`\n${files.length - failed} of ${files.length} uploadable.`);
process.exit(failed === 0 ? 0 : 1);
