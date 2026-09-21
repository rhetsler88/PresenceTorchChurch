/**
 * Shared output rules for App Store Connect screenshots, so the export and the
 * headless-capture path can never drift into producing different files.
 */
import sharp from "sharp";

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

/** Throws unless the file is exactly what App Store Connect accepts. */
export async function verifyUploadable(file, { width, height, label }) {
  const meta = await sharp(file).metadata();
  if (meta.format !== "jpeg") {
    throw new Error(`${label}: expected jpeg, got ${meta.format}`);
  }
  if (meta.width !== width || meta.height !== height) {
    throw new Error(`${label}: expected ${width}x${height}, got ${meta.width}x${meta.height}`);
  }
  if (meta.hasAlpha || meta.channels !== 3 || meta.space !== "srgb") {
    throw new Error(
      `${label}: App Store Connect wants opaque sRGB; got channels=${meta.channels} space=${meta.space}`,
    );
  }
  return meta;
}
