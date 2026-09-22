/**
 * Export App Store Connect screenshots as JPEG from source PNG frames.
 *
 * Apple rejects images with alpha and off-spec pixel sizes. The required
 * iPhone size is the 6.9" class (1320×2868, 1290×2796, or 1260×2736). iPad 13"
 * is required because this binary targets iPhone and iPad.
 *
 * Sources stay PNG so every re-export starts from a lossless master.
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

import { SLOTS } from "../src/lib/appStoreScreenshotSpec.js";
import { BACKGROUND, verifyUploadable, writeUploadableJpeg } from "./lib/appStoreImage.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outRoot = join(root, "assets", "app-store-screenshots");

/** Ordered to follow the sign-in flow a reviewer sees. */
const FRAMES = {
  signin: { source: "source-signin.png", out: "01-signin.jpg" },
  "daily-code": { source: "source-daily-code.png", out: "02-daily-code.jpg" },
  talk: { source: "source-talk.png", out: "03-talk.jpg" },
};

const SIZES = SLOTS.map(({ dir, width, height }) => ({ name: dir, width, height }));

/** Crop only when the frame is within 1% of the target ratio; otherwise pad. */
function resizeFit(sourceRatio, { width, height }) {
  const targetRatio = width / height;
  return Math.abs(sourceRatio - targetRatio) / targetRatio <= 0.01 ? "cover" : "contain";
}

async function exportSize(source, sourceRatio, frame, size) {
  const dir = join(outRoot, size.name);
  await mkdir(dir, { recursive: true });
  const dest = join(dir, frame.out);
  await writeUploadableJpeg(
    sharp(source)
      .flatten({ background: BACKGROUND })
      .resize(size.width, size.height, {
        fit: resizeFit(sourceRatio, size),
        position: "center",
        background: BACKGROUND,
        kernel: "lanczos3",
      }),
    dest,
  );

  const meta = await verifyUploadable(dest, {
    width: size.width,
    height: size.height,
    label: `${size.name}/${frame.out}`,
  });
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
