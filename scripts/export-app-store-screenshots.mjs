/**
 * Export App Store Connect screenshots as JPEG from source PNG frames.
 *
 * Apple rejects images with alpha and off-spec pixel sizes. The required
 * iPhone size is the 6.9" class (1320×2868, 1290×2796, or 1260×2736). iPad 13"
 * is required because this binary targets iPhone and iPad.
 *
 * Sources stay PNG so every re-export starts from a lossless master.
 *
 * Each slot is fed by a source captured at its own form factor: an iPad slot
 * takes an iPad capture, never a phone one scaled up. Frames whose aspect
 * ratio differs from a target are fit inside it and padded with the app
 * background, so no UI is cropped.
 *
 * Usage:
 *   node scripts/export-app-store-screenshots.mjs            # every frame
 *   node scripts/export-app-store-screenshots.mjs talk       # one frame
 */
import { existsSync } from "fs";
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
  signin: {
    out: "01-signin.jpg",
    sources: { phone: "source-signin.png", ipad: "source-ipad-signin.png" },
  },
  "daily-code": {
    out: "02-daily-code.jpg",
    sources: { phone: "source-daily-code.png" },
  },
  talk: {
    out: "03-talk.jpg",
    sources: { phone: "source-talk.png" },
  },
};

/** Crop only when the frame is within 1% of the target ratio; otherwise pad. */
function resizeFit(sourceRatio, { width, height }) {
  const targetRatio = width / height;
  return Math.abs(sourceRatio - targetRatio) / targetRatio <= 0.01 ? "cover" : "contain";
}

async function exportSize(source, sourceRatio, frame, slot) {
  const size = { name: slot.dir, width: slot.width, height: slot.height };
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
  console.log(`Exporting ${name}`);

  for (const slot of SLOTS) {
    if (!slot.frames.includes(frame.out)) continue;

    const sourceName = frame.sources[slot.formFactor];
    if (!sourceName || !existsSync(join(outRoot, sourceName))) {
      console.log(`  skipping ${slot.dir}: no ${slot.formFactor} capture for this frame`);
      continue;
    }

    const source = join(outRoot, sourceName);
    const meta = await sharp(source).metadata();
    await exportSize(source, meta.width / meta.height, frame, slot);
  }
}
console.log("Done.");
