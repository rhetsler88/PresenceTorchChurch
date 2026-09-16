/**
 * Export App Store Connect screenshots from source PNG frames.
 *
 * Apple rejects images with alpha and off-spec pixel sizes. The required
 * iPhone size is the 6.9" class (1320×2868, 1290×2796, or 1260×2736). iPad 13"
 * is required because this binary targets iPhone and iPad.
 *
 * Frames whose aspect ratio differs from a target (5.5" iPhone, 13" iPad) are
 * fit inside the target and padded with the app background, so no UI is cropped.
 *
 * Usage:
 *   node scripts/export-app-store-screenshots.mjs            # every frame
 *   node scripts/export-app-store-screenshots.mjs talk       # one frame
 */
import { mkdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outRoot = join(root, "assets", "app-store-screenshots");

/** Sign-in and Talk share this page background, so padding is seamless. */
const BACKGROUND = { r: 8, g: 12, b: 22, alpha: 1 };

/** Ordered to follow the sign-in flow a reviewer sees. */
const FRAMES = {
  signin: { source: "source-signin.png", out: "01-signin.png" },
  "daily-code": { source: "source-daily-code.png", out: "02-daily-code.png" },
  talk: { source: "source-talk.png", out: "03-talk.png" },
};

const SIZES = [
  { name: "iphone-6.9-inch-1320x2868", width: 1320, height: 2868 },
  { name: "iphone-6.9-inch-1290x2796", width: 1290, height: 2796 },
  { name: "iphone-6.5-inch-1284x2778", width: 1284, height: 2778 },
  { name: "iphone-6.5-inch-1242x2688", width: 1242, height: 2688 },
  { name: "iphone-5.5-inch-1242x2208", width: 1242, height: 2208 },
  { name: "ipad-13-inch-2064x2752", width: 2064, height: 2752 },
  { name: "ipad-13-inch-2048x2732", width: 2048, height: 2732 },
];

/** Crop only when the frame is within 1% of the target ratio; otherwise pad. */
function resizeFit(sourceRatio, { width, height }) {
  const targetRatio = width / height;
  return Math.abs(sourceRatio - targetRatio) / targetRatio <= 0.01 ? "cover" : "contain";
}

async function exportSize(source, sourceRatio, frame, size) {
  const dir = join(outRoot, size.name);
  await mkdir(dir, { recursive: true });
  const dest = join(dir, frame.out);
  await sharp(source)
    .flatten({ background: BACKGROUND })
    .resize(size.width, size.height, {
      fit: resizeFit(sourceRatio, size),
      position: "center",
      background: BACKGROUND,
      kernel: "lanczos3",
    })
    .removeAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(dest);

  const meta = await sharp(dest).metadata();
  if (meta.width !== size.width || meta.height !== size.height) {
    throw new Error(`${size.name}: expected ${size.width}x${size.height}, got ${meta.width}x${meta.height}`);
  }
  if (meta.channels !== 3 || meta.hasAlpha) {
    throw new Error(`${size.name}: App Store Connect rejects alpha; got channels=${meta.channels}`);
  }
  console.log(`  ${size.name}/${frame.out}  ${meta.width}x${meta.height}  ${meta.channels}ch`);
}

const requested = process.argv.slice(2);
for (const name of requested) {
  if (!FRAMES[name]) {
    throw new Error(`Unknown frame "${name}". Available: ${Object.keys(FRAMES).join(", ")}`);
  }
}
const names = requested.length ? requested : Object.keys(FRAMES);

await mkdir(outRoot, { recursive: true });
for (const name of names) {
  const frame = FRAMES[name];
  const source = join(outRoot, frame.source);
  const meta = await sharp(source).metadata();
  console.log(`Exporting ${name} from ${frame.source} (${meta.width}x${meta.height})`);
  for (const size of SIZES) {
    await exportSize(source, meta.width / meta.height, frame, size);
  }
}
console.log("Done.");
