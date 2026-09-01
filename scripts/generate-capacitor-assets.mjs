/**
 * Build Capacitor asset sources from assets/app-icon.png, then run @capacitor/assets.
 *
 * Usage:
 *   npm run cap:icons          # Android only
 *   npm run cap:icons -- --ios # Include iOS
 */
import sharp from "sharp";
import { mkdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "assets", "app-icon.png");
const outDir = join(root, "assets");
const BG = { r: 0, g: 0, b: 0, alpha: 1 };

async function writeFromSource(name) {
  await sharp(src)
    .resize(1024, 1024, { fit: "cover" })
    .png()
    .toFile(join(outDir, name));
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

console.log("Native launcher icons updated.");
