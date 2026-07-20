/**
 * Delete channel(s) from Firestore and related voiceMessages, pttSignals, audioChunks.
 *
 * Usage:
 *   node scripts/delete-channel.mjs --excess          # delete all channels not in seed-data.json
 *   node scripts/delete-channel.mjs <channelId>        # delete one channel by ID
 *   node scripts/delete-channel.mjs <channelId> --dry-run
 *
 * Requires scripts/serviceAccountKey.json (same as npm run seed).
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getAdminDb } from "./firestore-admin.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedData = JSON.parse(readFileSync(join(__dirname, "seed-data.json"), "utf8"));
const seedIds = new Set(seedData.channels.map((c) => c.id));

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const excessMode = args.includes("--excess");
const channelIds = args.filter((a) => !a.startsWith("--"));

const db = getAdminDb();

async function deleteByChannelId(collectionName, channelId) {
  const snap = await db.collection(collectionName).where("channel_id", "==", channelId).get();
  if (snap.empty) return 0;
  if (dryRun) return snap.size;

  const batchSize = 400;
  let deleted = 0;
  let batch = db.batch();
  let ops = 0;

  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    ops++;
    deleted++;
    if (ops >= batchSize) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return deleted;
}

async function deleteChannel(channelId) {
  const channelRef = db.collection("channels").doc(channelId);
  const channelSnap = await channelRef.get();
  if (!channelSnap.exists) {
    console.log(`  skip: channels/${channelId} does not exist`);
    return;
  }

  const name = channelSnap.data()?.name || channelId;
  console.log(`\n${dryRun ? "[dry-run] " : ""}Deleting channel "${name}" (${channelId})...`);

  for (const col of ["voiceMessages", "pttSignals", "audioChunks"]) {
    const count = await deleteByChannelId(col, channelId);
    if (count > 0) console.log(`  ${dryRun ? "would delete" : "deleted"} ${count} ${col}`);
  }

  if (dryRun) {
    console.log(`  would delete channels/${channelId}`);
    return;
  }

  await channelRef.delete();
  console.log(`  ✓ deleted channels/${channelId}`);
}

let targets = channelIds;

if (excessMode) {
  const snap = await db.collection("channels").get();
  targets = snap.docs.map((d) => d.id).filter((id) => !seedIds.has(id));
  if (!targets.length) {
    console.log("No excess channels found (all match seed-data.json).");
    process.exit(0);
  }
  console.log(`Excess channels to delete: ${targets.join(", ")}`);
}

if (!targets.length) {
  console.error(
    "Usage:\n" +
      "  node scripts/delete-channel.mjs --excess [--dry-run]\n" +
      "  node scripts/delete-channel.mjs <channelId> [--dry-run]"
  );
  process.exit(1);
}

for (const id of targets) {
  if (seedIds.has(id) && !excessMode) {
    console.error(`Refusing to delete seed channel "${id}". Use --excess only for non-seed channels.`);
    process.exit(1);
  }
  await deleteChannel(id);
}

console.log("\nDone.");
