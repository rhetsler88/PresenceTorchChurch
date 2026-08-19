/**
 * Capture Play Store screenshots from the live app (Pixel 7 viewport).
 * Usage: node scripts/capture-screenshots.mjs
 */
import { chromium, devices } from "playwright";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "assets", "device-screenshots");
const APP_URL = "https://app.presencetorch.net";

const firebaseConfig = {
  apiKey: "AIzaSyCfhAWoGKj8E7Kx0hzqsuOLrExxnmal-Ws",
  authDomain: "presence-torch-church.firebaseapp.com",
  projectId: "presence-torch-church",
  storageBucket: "presence-torch-church.firebasestorage.app",
  messagingSenderId: "956501692008",
  appId: "1:956501692008:web:12f8f8ad119b32c1e335dd",
};

mkdirSync(OUT, { recursive: true });

function getCustomToken() {
  return execFileSync(process.execPath, [join(__dirname, "get-custom-token.mjs")], {
    encoding: "utf8",
    cwd: join(__dirname, ".."),
  }).trim();
}

async function signInWithCustomToken(page, customToken) {
  await page.goto(`${APP_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    async ({ token, config }) => {
      const { initializeApp, getApps, getApp } = await import(
        "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js"
      );
      const { getAuth, signInWithCustomToken, browserLocalPersistence, initializeAuth } =
        await import("https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js");

      const app = getApps().length ? getApp() : initializeApp(config);
      let auth;
      try {
        auth = initializeAuth(app, { persistence: browserLocalPersistence });
      } catch {
        auth = getAuth(app);
      }
      await signInWithCustomToken(auth, token);
    },
    { token: customToken, config: firebaseConfig }
  );
  await page.goto(`${APP_URL}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);
}

async function capture(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`  saved ${path}`);
}

async function tapNav(page, label) {
  await page.getByRole("link", { name: new RegExp(`^${label}$`, "i") }).click();
  await page.waitForTimeout(1500);
}

async function main() {
  const customToken = getCustomToken();
  const device = devices["Pixel 7"];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...device,
    colorScheme: "dark",
  });
  const page = await context.newPage();

  console.log("Signing in with custom token...");
  await signInWithCustomToken(page, customToken);

  const url = page.url();
  if (url.includes("/login")) {
    throw new Error(`Still on login page after auth: ${url}`);
  }

  console.log("Capturing screens...");
  await capture(page, "01-talk");

  await tapNav(page, "Monitor");
  await capture(page, "02-monitor");

  await tapNav(page, "Channels");
  await capture(page, "03-channels");

  await tapNav(page, "Logs");
  await capture(page, "04-logs");

  await browser.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
