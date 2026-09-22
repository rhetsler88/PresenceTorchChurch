/**
 * Shared output rules for App Store Connect screenshots, so the export and the
 * headless-capture path can never drift into producing different files.
 */
import { statSync } from "fs";
import sharp from "sharp";

import { findUploadProblems } from "../../src/lib/appStoreScreenshotSpec.js";

/** The page background behind every frame, used to fill padding seamlessly. */
export const BACKGROUND = { r: 8, g: 12, b: 22, alpha: 1 };

/**
 * 4:4:4 keeps small UI text and thin borders from smearing at quality 92.
 * Baseline rather than progressive (what `mozjpeg: true` would force) because
 * the App Store Connect uploader is the fussiest decoder these files meet.
 */
export const JPEG_OPTIONS = {
  quality: 92,
  chromaSubsampling: "4:4:4",
  progressive: false,
  optimiseCoding: true,
  trellisQuantisation: true,
  overshootDeringing: true,
};

/**
 * Finishes and writes a frame. The sRGB profile costs 500 bytes and states the
 * color space outright instead of leaving a reviewer's tooling to assume it.
 */
export function writeUploadableJpeg(pipeline, dest) {
  return pipeline.toColourspace("srgb").withIccProfile("srgb").jpeg(JPEG_OPTIONS).toFile(dest);
}

/** Opaque 8-bit RGB PNG — App Store Connect rejects alpha on screenshots. */
export function writeUploadablePng(pipeline, dest) {
  return pipeline
    .toColourspace("srgb")
    .removeAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(dest);
}

/** Throws unless the written file is exactly what App Store Connect accepts. */
export async function verifyUploadable(file, { width, height, label }) {
  const meta = await sharp(file).metadata();
  const problems = findUploadProblems({ ...meta, bytes: statSync(file).size });
  if (meta.width !== width || meta.height !== height) {
    problems.push(`expected ${width}x${height}, got ${meta.width}x${meta.height}`);
  }
  if (problems.length > 0) {
    throw new Error(`${label}: ${problems.join("; ")}`);
  }
  return meta;
}
