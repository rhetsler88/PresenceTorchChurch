/**
 * Print SHA-1 / SHA-256 fingerprints for Firebase Google Sign-In setup.
 *
 * Usage: npm run cap:sha1
 */
import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const googleServicesPath = join(root, "android/app/google-services.json");

const keytool =
  process.env.JAVA_HOME
    ? `${process.env.JAVA_HOME}/bin/keytool`
    : "keytool";

const debugKeystore = `${process.env.USERPROFILE || process.env.HOME}/.android/debug.keystore`;
const releaseKeystore = "C:/Users/rhets/presence-torch-release.keystore";

function toColonSha(hash) {
  const clean = String(hash || "").replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  return clean.match(/.{1,2}/g)?.join(":") || clean;
}

function printRegisteredFirebaseShas() {
  if (!existsSync(googleServicesPath)) {
    console.log("\nFirebase (google-services.json): file not found");
    return;
  }
  const json = JSON.parse(readFileSync(googleServicesPath, "utf8"));
  const clients = json?.client?.[0]?.oauth_client?.filter((c) => c.client_type === 1) || [];
  console.log("\nRegistered in Firebase (google-services.json Android OAuth clients):");
  if (!clients.length) {
    console.log("  (none — add SHA-1 fingerprints in Firebase and re-download this file)");
    return;
  }
  for (const client of clients) {
    const hash = client.android_info?.certificate_hash;
    console.log(`  SHA-1: ${toColonSha(hash)}`);
  }
  console.log("\n  For Play closed testing, one of the above MUST exactly match");
  console.log("  Play Console → Protected with Play → Play app signing → App signing key certificate");
  console.log("  (NOT the Upload key certificate block)");
}

function print(label, keystore, alias, storepass) {
  if (!existsSync(keystore)) {
    console.log(`\n${label}: skipped (${keystore} not found)`);
    return;
  }
  console.log(`\n${label}`);
  console.log(`  keystore: ${keystore}`);
  try {
    const out = execFileSync(
      keytool,
      ["-list", "-v", "-keystore", keystore, "-alias", alias, "-storepass", storepass],
      { encoding: "utf8" }
    );
    for (const line of out.split(/\r?\n/)) {
      if (/SHA1:|SHA256:/.test(line)) {
        console.log(`  ${line.trim()}`);
      }
    }
  } catch (err) {
    console.log(`  error: ${err.message}`);
  }
}

console.log("Compare Play App Signing SHA-1 with the Firebase list below.\n");
printRegisteredFirebaseShas();
print("Debug (Android Studio Run / USB install)", debugKeystore, "androiddebugkey", "android");
print(
  "Upload keystore (what YOU sign the AAB with — not what Play installs)",
  releaseKeystore,
  "presencetorch",
  process.env.PRESENCE_TORCH_KEYSTORE_PASSWORD || "(set PRESENCE_TORCH_KEYSTORE_PASSWORD)"
);

console.log("\nIf Play App Signing SHA-1 is missing from Firebase:");
console.log("  1. Firebase Console → presence-torch-church → Project settings → Android app");
console.log("  2. Add fingerprint → paste Play App Signing SHA-1");
console.log("  3. npx firebase-tools apps:sdkconfig ANDROID --project presence-torch-church > android/app/google-services.json");
console.log("  4. npm run cap:sync:android → rebuild signed AAB → upload to Play");
