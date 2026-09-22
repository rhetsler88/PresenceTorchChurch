/**
 * Export sign-in screenshots as opaque PNGs for App Store Connect.
 *
 * Same sizing and padding as the JPEG export; output lives in
 * assets/app-store-signin-png/ so the JPEG slot folders stay unchanged.
 *
 * Usage:
 *   npm run export:app-store-signin-png
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
const outRoot = join(__dirname, "..", "assets", "app-store-signin-png");

const OUT_NAME = "01-signin.png";
const SOURCES = { phone: "source-signin.png", ipad: "source-ipad-signin.png" };

function resizeFit(sourceRatio, { width, height }) {
  const targetRatio = width / height;
  return Math.abs(sourceRatio - targetRatio) / targetRatio <= 0.01 ? "cover" : "contain";
}

await mkdir(outRoot, { recursive: true });

for (const slot of SLOTS) {
  if (!slot.frames.some((name) => name.startsWith("01-signin"))) continue;

  const sourceName = SOURCES[slot.formFactor];
  if (!sourceName || !existsSync(join(shotRoot, sourceName))) {
    console.log(`Skipping ${slot.dir}: no ${slot.formFactor} source`);
    continue;
  }

  const source = join(shotRoot, sourceName);
  const { width, height } = await sharp(source).metadata();
  const sourceRatio = width / height;

  const dir = join(outRoot, slot.dir);
  await mkdir(dir, { recursive: true });
  const dest = join(dir, OUT_NAME);

  await writeUploadablePng(
    sharp(source)
      .flatten({ background: BACKGROUND })
      .resize(slot.width, slot.height, {
        fit: resizeFit(sourceRatio, slot),
        position: "center",
        background: BACKGROUND,
        kernel: "lanczos3",
      }),
    dest,
  );

  const meta = await verifyUploadable(dest, {
    width: slot.width,
    height: slot.height,
    label: `${slot.dir}/${OUT_NAME}`,
  });
  if (meta.format !== "png" || meta.hasAlpha || meta.channels !== 3) {
    throw new Error(`${slot.dir}/${OUT_NAME}: expected opaque RGB PNG`);
  }
  console.log(`  ${slot.dir}/${OUT_NAME}  ${meta.width}x${meta.height}  ${meta.channels}ch  no alpha`);
}

console.log(`Done. Files are under assets/app-store-signin-png/`);
