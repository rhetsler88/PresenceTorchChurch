/**
 * Copy the public reCAPTCHA site key from the live web app into .env.local.
 * Site keys are client-side/public (not secrets).
 */
import { readFileSync, writeFileSync, existsSync } from "fs";

const APP_URL = "https://app.presencetorch.net";
const ENV_PATH = ".env.local";

async function findSiteKey() {
  const html = await (await fetch(APP_URL)).text();
  const jsPath =
    html.match(/src="(\.\/assets\/index-[^"]+\.js)"/)?.[1] ||
    html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
  if (!jsPath) throw new Error("Could not find app JS bundle in index.html");

  const jsUrl = jsPath.startsWith("./")
    ? `${APP_URL}/${jsPath.slice(2)}`
    : `${APP_URL}${jsPath}`;
  const js = await (await fetch(jsUrl)).text();
  const match = js.match(/6L[a-zA-Z0-9_-]{20,}/);
  if (!match) throw new Error("Could not find reCAPTCHA site key in production bundle");
  return match[0];
}

function upsertEnvVar(path, key, value) {
  const line = `${key}=${value}`;
  if (!existsSync(path)) {
    writeFileSync(path, `${line}\n`, "utf8");
    return;
  }
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (idx >= 0) lines[idx] = line;
  else lines.push(line);
  writeFileSync(path, lines.filter(Boolean).join("\n") + "\n", "utf8");
}

const siteKey = await findSiteKey();
upsertEnvVar(ENV_PATH, "VITE_RECAPTCHA_SITE_KEY", siteKey);
upsertEnvVar(".env.production.local", "VITE_RECAPTCHA_SITE_KEY", siteKey);
console.log(`Updated env files with VITE_RECAPTCHA_SITE_KEY (len ${siteKey.length})`);
