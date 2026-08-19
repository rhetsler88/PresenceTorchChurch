/**
 * Build Capacitor asset sources from public/logo.png, then run @capacitor/assets.
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
const src = join(root, "public", "logo.png");
const outDir = join(root, "assets");
const BG = { r: 15, g: 23, b: 42, alpha: 1 }; // #0f172a — matches app theme

async function writeSquare(name, pipeline) {
  await pipeline.png().toFile(join(outDir, name));
}

await mkdir(outDir, { recursive: true });

const logo = sharp(src).resize(768, 768, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });

await writeSquare(
  "icon-only.png",
  sharp({
    create: { width: 1024, height: 1024, channels: 4, background: BG },
  }).composite([{ input: await logo.toBuffer(), gravity: "center" }])
);

await writeSquare(
  "icon-foreground.png",
  sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: await logo.toBuffer(), gravity: "center" }])
);

await writeSquare(
  "icon-background.png",
  sharp({
    create: { width: 1024, height: 1024, channels: 3, background: BG },
  })
);

// Minimal splash — logo centered on brand background (Capacitor requires 2732+).
const splashLogo = sharp(src).resize(1400, 1400, {
  fit: "contain",
  background: { r: 0, g: 0, b: 0, alpha: 0 },
});
await writeSquare(
  "splash.png",
  sharp({
    create: { width: 2732, height: 2732, channels: 4, background: BG },
  }).composite([{ input: await splashLogo.toBuffer(), gravity: "center" }])
);
await writeSquare(
  "splash-dark.png",
  sharp({
    create: { width: 2732, height: 2732, channels: 4, background: BG },
  }).composite([{ input: await splashLogo.toBuffer(), gravity: "center" }])
);

console.log("Wrote Capacitor asset sources to assets/");

const args = process.argv.slice(2);
const platformArgs = args.includes("--ios") ? [] : ["--android"];
execFileSync("npx", ["@capacitor/assets", "generate", ...platformArgs], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

console.log("Native launcher icons updated.");
