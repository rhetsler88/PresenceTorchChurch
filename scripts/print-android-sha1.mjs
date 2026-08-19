/**
 * Print SHA-1 / SHA-256 fingerprints for Firebase Google Sign-In setup.
 *
 * Usage: npm run cap:sha1
 *
 * Add ALL printed fingerprints to:
 * Firebase Console → Project Settings → Your apps → Android → Add fingerprint
 * Then download an updated google-services.json into android/app/
 */
import { execFileSync } from "child_process";
import { existsSync } from "fs";

const keytool =
  process.env.JAVA_HOME
    ? `${process.env.JAVA_HOME}/bin/keytool`
    : "keytool";

const debugKeystore = `${process.env.USERPROFILE || process.env.HOME}/.android/debug.keystore`;
const releaseKeystore = "C:/Users/rhets/presence-torch-release.keystore";

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

console.log("Add these fingerprints in Firebase Console, then re-download google-services.json.");
console.log("For Play Store closed testing, also add the Play App Signing SHA-1 from:");
console.log("Play Console → Release → Setup → App integrity → App signing key certificate\n");

print("Debug (local emulator / debug APK)", debugKeystore, "androiddebugkey", "android");
print("Release upload keystore (your local AAB signing key)", releaseKeystore, "presencetorch", process.env.PRESENCE_TORCH_KEYSTORE_PASSWORD || "(set PRESENCE_TORCH_KEYSTORE_PASSWORD)");

console.log("\nAfter adding fingerprints, replace android/app/google-services.json from Firebase.");
