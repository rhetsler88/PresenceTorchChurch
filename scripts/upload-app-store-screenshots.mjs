/**
 * Upload App Store screenshots through Apple's API instead of the browser.
 *
 * The web uploader accepts a file and then drops it without saying why. This
 * path reports Apple's actual objection, and `--dry-run` reports the state of
 * the listing without changing anything.
 *
 * Setup: App Store Connect > Users and Access > Integrations > App Store
 * Connect API, create a key with the App Manager role, download the .p8 once.
 *
 *   export ASC_KEY_ID=XXXXXXXXXX
 *   export ASC_ISSUER_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
 *   export ASC_PRIVATE_KEY_PATH=~/Downloads/AuthKey_XXXXXXXXXX.p8
 *
 * Usage:
 *   npm run upload:app-store-screenshots -- --dry-run
 *   npm run upload:app-store-screenshots -- --only=iphone-6.5-inch-1284x2778
 *   npm run upload:app-store-screenshots -- --replace
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

import { findUploadProblems, SLOTS } from "../src/lib/appStoreScreenshotSpec.js";
import { createClient, createToken, displayTypeFor, EDITABLE_STATES, md5 } from "./lib/appStoreConnect.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
/** Default JPEG set; for iPad PNG use ASC_SCREENSHOT_DIR=assets/app-store-ipad-png */
const shotRoot = join(root, process.env.ASC_SCREENSHOT_DIR ?? "assets/app-store-screenshots");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const replace = args.includes("--replace");
const only = args.find((arg) => arg.startsWith("--only="))?.split("=")[1];
const locale = args.find((arg) => arg.startsWith("--locale="))?.split("=")[1] ?? "en-US";
const bundleId = process.env.ASC_BUNDLE_ID ?? "church.presencetorch.app";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See the header of this script for setup.`);
  return value;
}

function readPrivateKey() {
  const inline = process.env.ASC_PRIVATE_KEY;
  if (inline) return inline.replace(/\\n/g, "\n");
  return readFileSync(requireEnv("ASC_PRIVATE_KEY_PATH").replace(/^~/, process.env.HOME ?? "~"), "utf8");
}

function slotFolders() {
  const wanted = only ? SLOTS.filter((slot) => slot.dir === only) : SLOTS;
  if (wanted.length === 0) {
    throw new Error(`Unknown folder "${only}". Available: ${SLOTS.map((s) => s.dir).join(", ")}`);
  }
  return wanted;
}

/** Refuses to upload anything Apple would reject, so a failure means something else. */
async function readFrames(slot) {
  const dir = join(shotRoot, slot.dir);
  const frames = [];
  for (const name of readdirSync(dir).sort()) {
    if (!/\.(png|jpe?g)$/i.test(name)) continue;
    const file = join(dir, name);
    const buffer = readFileSync(file);
    const meta = await sharp(buffer).metadata();
    const problems = findUploadProblems({ ...meta, bytes: buffer.length });
    if (problems.length > 0) {
      throw new Error(`${slot.dir}/${name} is not uploadable: ${problems.join("; ")}`);
    }
    frames.push({ name, buffer });
  }
  return frames;
}

const client = createClient({
  token: createToken({
    issuerId: requireEnv("ASC_ISSUER_ID"),
    keyId: requireEnv("ASC_KEY_ID"),
    privateKeyPem: readPrivateKey(),
  }),
});

const app = await client.findApp(bundleId);
console.log(`App: ${app.attributes.name} (${bundleId})`);

const versions = await client.listVersions(app.id);
for (const version of versions) {
  console.log(`  version ${version.attributes.versionString}: ${version.attributes.appStoreState}`);
}

const editable = versions.find((version) => EDITABLE_STATES.has(version.attributes.appStoreState));
if (!editable) {
  const states = versions.map((v) => `${v.attributes.versionString} (${v.attributes.appStoreState})`).join(", ");
  throw new Error(
    `No version accepts metadata edits right now: ${states}.\n` +
      `Screenshots are read-only once a version is submitted. Remove it from review, ` +
      `or add a new version, then run this again.`,
  );
}
console.log(`Editing version ${editable.attributes.versionString} (${editable.attributes.appStoreState})`);

const localizations = await client.listLocalizations(editable.id);
const localization = localizations.find((item) => item.attributes.locale === locale);
if (!localization) {
  const available = localizations.map((item) => item.attributes.locale).join(", ");
  throw new Error(`No ${locale} localization. Available: ${available}`);
}

const sets = await client.listScreenshotSets(localization.id);
console.log(`Existing screenshot sets for ${locale}:`);
for (const set of sets) {
  const shots = await client.listScreenshots(set.id);
  console.log(`  ${set.attributes.screenshotDisplayType}: ${shots.length} screenshot(s)`);
}

for (const slot of slotFolders()) {
  const displayType = displayTypeFor(slot.width, slot.height);
  if (!displayType) {
    console.log(`Skipping ${slot.dir}: no display type known for ${slot.width}x${slot.height}`);
    continue;
  }

  const frames = await readFrames(slot);
  console.log(`\n${slot.dir} -> ${displayType} (${frames.length} frames)`);
  if (dryRun) {
    for (const frame of frames) console.log(`  would upload ${frame.name} (${frame.buffer.length} bytes)`);
    continue;
  }

  let set = sets.find((item) => item.attributes.screenshotDisplayType === displayType);
  if (!set) {
    set = await client.createScreenshotSet(localization.id, displayType);
    console.log(`  created set ${set.id}`);
  }

  if (replace) {
    for (const existing of await client.listScreenshots(set.id)) {
      await client.deleteScreenshot(existing.id);
      console.log(`  deleted ${existing.attributes.fileName ?? existing.id}`);
    }
  }

  for (const frame of frames) {
    const reserved = await client.reserveScreenshot({
      setId: set.id,
      fileName: frame.name,
      fileSize: frame.buffer.length,
    });
    await client.uploadBytes(reserved.attributes.uploadOperations, frame.buffer);
    await client.commitScreenshot(reserved.id, md5(frame.buffer));
    console.log(`  uploaded ${frame.name}`);
  }
}

console.log(dryRun ? "\nDry run only; nothing changed." : "\nDone.");
