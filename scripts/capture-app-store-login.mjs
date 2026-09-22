/**
 * Capture the sign-in screen from a running dev server as a source master.
 *
 * Output is a lossless PNG next to the device screenshots, not a finished
 * slot file: `npm run export:app-store-screenshots signin` turns it into
 * every accepted size afterwards.
 *
 * The iPad master matters because it is the only iPad-native frame we can
 * produce without a device — the sign-in screen is the one screen that
 * renders before authentication.
 *
 * Usage:
 *   npm run dev
 *   npm run capture:app-store-login -- --ipad
 *   npm run capture:app-store-login -- --phone   # overwrites the device master
 */
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outRoot = join(__dirname, "..", "assets", "app-store-screenshots");
const APP_URL = (process.env.APP_URL || "http://127.0.0.1:5173").replace(/\/$/, "");
const CHROME = process.env.CHROME_PATH || "google-chrome-stable";

/** Capture at the largest size in each family; the export scales down from it. */
const FORM_FACTORS = {
  ipad: { cssWidth: 1032, cssHeight: 1376, scale: 2, out: "source-ipad-signin.png" },
  phone: { cssWidth: 440, cssHeight: 956, scale: 3, out: "source-signin.png" },
};

function runChrome(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(CHROME, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`chrome exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

const requested = process.argv.slice(2).map((arg) => arg.replace(/^--/, ""));
const names = requested.filter((name) => name in FORM_FACTORS);
if (names.length === 0) {
  throw new Error(`Pass --ipad and/or --phone. Got: ${process.argv.slice(2).join(" ") || "nothing"}`);
}

const tmpDir = await mkdtemp(join(tmpdir(), "app-store-login-"));
console.log(`Capturing ${APP_URL}/login?storePreview=1`);

for (const name of names) {
  const device = FORM_FACTORS[name];
  const rawPath = join(tmpDir, `${name}.png`);
  await runChrome([
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-sandbox",
    "--no-first-run",
    "--disable-extensions",
    "--mute-audio",
    `--force-device-scale-factor=${device.scale}`,
    `--window-size=${device.cssWidth},${device.cssHeight}`,
    `--screenshot=${rawPath}`,
    "--virtual-time-budget=15000",
    "--run-all-compositor-stages-before-draw",
    `${APP_URL}/login?storePreview=1`,
  ]);

  const dest = join(outRoot, device.out);
  await sharp(rawPath).png({ compressionLevel: 9 }).toFile(dest);
  const meta = await sharp(dest).metadata();
  console.log(`  ${device.out}  ${meta.width}x${meta.height}`);
}

console.log("Done. Now run: npm run export:app-store-screenshots signin");
