/**
 * Seeds organizations and channels into Firestore.
 *
 * Setup:
 *   1. Firebase Console → Project Settings → Service Accounts → Generate new private key
 *   2. Save as scripts/serviceAccountKey.json (gitignored)
 *   3. Run: npm run seed
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = join(__dirname, "serviceAccountKey.json");
const dataPath = join(__dirname, "seed-data.json");

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
} catch {
  console.error(
    "\nMissing scripts/serviceAccountKey.json\n" +
      "Download from Firebase Console → Project Settings → Service Accounts → Generate new private key\n"
  );
  process.exit(1);
}

const seedData = JSON.parse(readFileSync(dataPath, "utf8"));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const now = Timestamp.now();

async function seed() {
  console.log("Seeding organizations...");
  for (const org of seedData.organizations) {
    const { id, ...data } = org;
    await db.collection("organizations").doc(id).set(data, { merge: true });
    console.log(`  ✓ organizations/${id}`);
  }

  console.log("Seeding channels...");
  for (const channel of seedData.channels) {
    const { id, ...data } = channel;
    await db.collection("channels").doc(id).set({ ...data, created_date: now }, { merge: true });
    console.log(`  ✓ channels/${id}`);
  }

  console.log("\nDone! Seeded:");
  console.log(`  ${seedData.organizations.length} organization(s)`);
  console.log(`  ${seedData.channels.length} channel(s)`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
