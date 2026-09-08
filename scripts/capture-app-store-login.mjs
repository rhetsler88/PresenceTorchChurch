/**
 * Capture the sign-in screen at App Store Connect pixel sizes using Chrome.
 *
 * Usage:
 *   APP_URL=http://127.0.0.1:5173 node scripts/capture-app-store-login.mjs
 */
import { mkdir, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outRoot = join(root, "assets", "app-store-screenshots");
const APP_URL = (process.env.APP_URL || "http://127.0.0.1:5173").replace(/\/$/, "");
const CHROME = process.env.CHROME_PATH || "google-chrome-stable";
const BACKGROUND = { r: 8, g: 12, b: 22 };

const DEVICES = [
  { name: "iphone-6.9-inch-1320x2868", cssWidth: 440, cssHeight: 956, scale: 3, width: 1320, height: 2868 },
  { name: "iphone-6.9-inch-1290x2796", cssWidth: 430, cssHeight: 932, scale: 3, width: 1290, height: 2796 },
  { name: "iphone-6.5-inch-1284x2778", cssWidth: 428, cssHeight: 926, scale: 3, width: 1284, height: 2778 },
  { name: "iphone-6.5-inch-1242x2688", cssWidth: 414, cssHeight: 896, scale: 3, width: 1242, height: 2688 },
  { name: "iphone-5.5-inch-1242x2208", cssWidth: 414, cssHeight: 736, scale: 3, width: 1242, height: 2208 },
  { name: "ipad-13-inch-2064x2752", cssWidth: 1032, cssHeight: 1376, scale: 2, width: 2064, height: 2752 },
];

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

async function captureDevice(tmpDir, device) {
  const rawPath = join(tmpDir, `${device.name}.png`);
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
    "--virtual-time-budget=12000",
    "--run-all-compositor-stages-before-draw",
    `${APP_URL}/login?storePreview=1`,
  ]);

  const dir = join(outRoot, device.name);
  await mkdir(dir, { recursive: true });
  const dest = join(dir, "01-signin.png");
  await sharp(rawPath)
    .flatten({ background: BACKGROUND })
    .resize(device.width, device.height, {
      fit: "cover",
      position: "center",
      kernel: "lanczos3",
    })
    .removeAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(dest);

  const meta = await sharp(dest).metadata();
  if (meta.width !== device.width || meta.height !== device.height) {
    throw new Error(`${device.name}: expected ${device.width}x${device.height}, got ${meta.width}x${meta.height}`);
  }
  if (meta.hasAlpha || meta.channels !== 3) {
    throw new Error(`${device.name}: App Store Connect rejects alpha`);
  }
  console.log(`  captured ${device.name}/01-signin.png  ${meta.width}x${meta.height}`);
}

const tmpDir = await mkdtemp(join(tmpdir(), "app-store-login-"));
console.log(`Capturing login from ${APP_URL}`);
for (const device of DEVICES) {
  await captureDevice(tmpDir, device);
}
console.log("Done.");
