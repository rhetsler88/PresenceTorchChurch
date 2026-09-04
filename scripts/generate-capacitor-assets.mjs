/**
 * Build Capacitor asset sources from assets/app-icon.png, then run @capacitor/assets.
 *
 * The Android source has a shield on a dark field with pre-rounded transparent
 * corners. iOS App Store icons must be a full 1024×1024 square with no alpha
 * so Apple can apply the squircle mask. This script flattens that artwork onto
 * an opaque black square for AppIcon.appiconset.
 *
 * Usage:
 *   npm run cap:icons          # Android + flattened iOS AppIcon
 *   npm run cap:icons -- --ios # Also run @capacitor/assets iOS splash/icons
 */
import sharp from "sharp";
import { mkdir, readdir, unlink, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "assets", "app-icon.png");
const outDir = join(root, "assets");
const iosIconDir = join(root, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset");
const iosIconName = "AppIcon-1024.png";
const BG = { r: 0, g: 0, b: 0, alpha: 1 };

async function writeFromSource(name) {
  await sharp(src)
    .resize(1024, 1024, { fit: "cover" })
    .png()
    .toFile(join(outDir, name));
}

/** Full-bleed opaque square — no rounded corners, no alpha channel. */
async function writeIosAppIcon() {
  await mkdir(iosIconDir, { recursive: true });
  const keep = new Set([iosIconName, "Contents.json"]);
  for (const name of await readdir(iosIconDir)) {
    if (!keep.has(name)) {
      await unlink(join(iosIconDir, name));
    }
  }
  await sharp(src)
    .resize(1024, 1024, { fit: "cover" })
    .flatten({ background: BG })
    .removeAlpha()
    .png()
    .toFile(join(iosIconDir, iosIconName));
  await writeFile(
    join(iosIconDir, "Contents.json"),
    `${JSON.stringify(
      {
        images: [
          {
            filename: iosIconName,
            idiom: "universal",
            platform: "ios",
            size: "1024x1024",
          },
        ],
        info: { author: "xcode", version: 1 },
      },
      null,
      2,
    )}\n`,
  );
}

await mkdir(outDir, { recursive: true });

await writeFromSource("icon-only.png");
await writeFromSource("icon-foreground.png");

await sharp({
  create: { width: 1024, height: 1024, channels: 3, background: BG },
})
  .png()
  .toFile(join(outDir, "icon-background.png"));

const splashLogo = sharp(src).resize(1400, 1400, { fit: "contain", background: BG });
await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: BG },
})
  .composite([{ input: await splashLogo.toBuffer(), gravity: "center" }])
  .png()
  .toFile(join(outDir, "splash.png"));

await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: BG },
})
  .composite([{ input: await splashLogo.toBuffer(), gravity: "center" }])
  .png()
  .toFile(join(outDir, "splash-dark.png"));

console.log("Wrote Capacitor asset sources to assets/ from assets/app-icon.png");

const args = process.argv.slice(2);
const platformArgs = args.includes("--ios") ? [] : ["--android"];
execFileSync("npx", ["@capacitor/assets", "generate", ...platformArgs], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

// Always rewrite the iOS AppIcon after @capacitor/assets so a --ios run cannot
// replace the full-bleed square with a pre-rounded or transparent icon.
await writeIosAppIcon();
console.log(`Wrote flattened iOS AppIcon to ${join(iosIconDir, iosIconName)}`);
console.log("Native launcher icons updated.");
