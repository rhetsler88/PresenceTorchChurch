/**
 * Export iPad App Store screenshots as opaque PNGs.
 *
 * Sign-in uses source-ipad-signin.png (iPad viewport). Daily code and Talk
 * use the phone device captures, fit inside the iPad canvas with background
 * padding — replace those two with iPad simulator Cmd+S captures when you
 * have them (source-ipad-daily-code.png / source-ipad-talk.png).
 *
 * Usage:
 *   npm run export:app-store-ipad-png
 */
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

import { SLOTS } from "../src/lib/appStoreScreenshotSpec.js";
import { BACKGROUND, verifyUploadable, writeUploadablePng } from "./lib/appStoreImage.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shotRoot = join(__dirname, "..", "assets", "app-store-screenshots");
const outRoot = join(__dirname, "..", "assets", "app-store-ipad-png");

const IPAD_SLOTS = SLOTS.filter((slot) => slot.formFactor === "ipad");

const FRAMES = [
  { out: "01-signin.png", sources: ["source-ipad-signin.png", "source-signin.png"] },
  { out: "02-daily-code.png", sources: ["source-ipad-daily-code.png", "source-daily-code.png"] },
  { out: "03-talk.png", sources: ["source-ipad-talk.png", "source-talk.png"] },
];

function resizeFit(sourceRatio, { width, height }) {
  const targetRatio = width / height;
  return Math.abs(sourceRatio - targetRatio) / targetRatio <= 0.01 ? "cover" : "contain";
}

function pickSource(candidates) {
  for (const name of candidates) {
    const path = join(shotRoot, name);
    if (existsSync(path)) return path;
  }
  return null;
}

await mkdir(outRoot, { recursive: true });

for (const slot of IPAD_SLOTS) {
  const dir = join(outRoot, slot.dir);
  await mkdir(dir, { recursive: true });
  console.log(slot.dir);

  for (const frame of FRAMES) {
    const source = pickSource(frame.sources);
    if (!source) {
      console.log(`  skip ${frame.out}: no source`);
      continue;
    }

    const meta = await sharp(source).metadata();
    const dest = join(dir, frame.out);

    await writeUploadablePng(
      sharp(source)
        .flatten({ background: BACKGROUND })
        .resize(slot.width, slot.height, {
          fit: resizeFit(meta.width / meta.height, slot),
          position: "center",
          background: BACKGROUND,
          kernel: "lanczos3",
        }),
      dest,
    );

    const out = await verifyUploadable(dest, {
      width: slot.width,
      height: slot.height,
      label: `${slot.dir}/${frame.out}`,
    });
    if (out.format !== "png" || out.hasAlpha || out.channels !== 3) {
      throw new Error(`${frame.out}: expected opaque RGB PNG`);
    }
    console.log(`  ${frame.out}  ${out.width}x${out.height}  from ${source.split("/").pop()}`);
  }
}

console.log(`\nDone. Upload from assets/app-store-ipad-png/`);
