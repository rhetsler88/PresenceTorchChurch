/**
 * Export App Store Connect screenshots from a source sign-in PNG.
 *
 * Apple rejects images with alpha. Required iPhone size is the 6.9" class
 * (1320×2868, 1290×2796, or 1260×2736). iPad 13" is required because this
 * binary targets iPhone and iPad.
 *
 * Usage:
 *   node scripts/export-app-store-screenshots.mjs
 *   node scripts/export-app-store-screenshots.mjs path/to/source.png
 */
import { mkdir } from "fs/promises";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const defaultSource = join(root, "assets", "app-store-screenshots", "source-signin.png");
const outRoot = join(root, "assets", "app-store-screenshots");

/** Matches the sign-in page background (sampled from the source frame). */
const BACKGROUND = { r: 8, g: 12, b: 22, alpha: 1 };

const SIZES = [
  { name: "iphone-6.9-inch-1320x2868", width: 1320, height: 2868, fit: "cover" },
  { name: "iphone-6.9-inch-1290x2796", width: 1290, height: 2796, fit: "cover" },
  { name: "iphone-6.5-inch-1284x2778", width: 1284, height: 2778, fit: "cover" },
  { name: "iphone-5.5-inch-1242x2208", width: 1242, height: 2208, fit: "contain" },
  { name: "ipad-13-inch-2064x2752", width: 2064, height: 2752, fit: "contain" },
];

async function exportSize(source, { name, width, height, fit }) {
  const dir = join(outRoot, name);
  await mkdir(dir, { recursive: true });
  const dest = join(dir, "01-signin.png");
  await sharp(source)
    .flatten({ background: BACKGROUND })
    .resize(width, height, {
      fit,
      position: "center",
      background: BACKGROUND,
      kernel: "lanczos3",
    })
    .removeAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(dest);

  const meta = await sharp(dest).metadata();
  if (meta.width !== width || meta.height !== height) {
    throw new Error(`${name}: expected ${width}x${height}, got ${meta.width}x${meta.height}`);
  }
  if (meta.channels !== 3 || meta.hasAlpha) {
    throw new Error(`${name}: App Store Connect rejects alpha; got channels=${meta.channels}`);
  }
  console.log(`  ${name}/01-signin.png  ${meta.width}x${meta.height}  ${meta.channels}ch`);
}

const source = resolve(process.argv[2] || defaultSource);
await mkdir(outRoot, { recursive: true });
console.log(`Exporting App Store screenshots from ${source}`);
for (const size of SIZES) {
  await exportSize(source, size);
}
console.log("Done.");
