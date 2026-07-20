/**
 * List all channels in Firestore and mark which are default (from seed-data.json).
 *
 * Run: node scripts/list-channels.mjs
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getAdminDb } from "./firestore-admin.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedData = JSON.parse(readFileSync(join(__dirname, "seed-data.json"), "utf8"));
const seedIds = new Set(seedData.channels.map((c) => c.id));

const db = getAdminDb();
const snap = await db.collection("channels").get();

if (snap.empty) {
  console.log("No channels in Firestore.");
  process.exit(0);
}

console.log(`Found ${snap.size} channel(s):\n`);
for (const doc of snap.docs) {
  const data = doc.data();
  const tag = seedIds.has(doc.id) ? "seed (keep)" : "EXCESS (not in seed)";
  console.log(`  ${doc.id}`);
  console.log(`    name: ${data.name || "(unnamed)"}`);
  console.log(`    organization: ${data.organization || "(none)"}`);
  console.log(`    members: ${(data.members || []).length}`);
  console.log(`    is_active: ${data.is_active !== false}`);
  console.log(`    → ${tag}\n`);
}

const excess = snap.docs.filter((d) => !seedIds.has(d.id));
if (excess.length) {
  console.log("Excess channel IDs (safe to delete if unused):");
  excess.forEach((d) => console.log(`  ${d.id} — ${d.data().name || "(unnamed)"}`));
} else {
  console.log("No excess channels — all match seed-data.json.");
}
