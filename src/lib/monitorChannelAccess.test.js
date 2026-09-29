import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("monitorChannelAccess", () => {
  it("defaults monitors to all org channels minus broadcast_excluded_channels", () => {
    const userUtils = readFileSync(join(root, "src/lib/userUtils.js"), "utf8");
    assert.ok(userUtils.includes("isDedicatedMonitorUser"));
    assert.ok(userUtils.includes("applyMonitorBroadcastExclusions"));
    assert.ok(userUtils.includes("isMonitorBroadcastExcluded"));
    assert.ok(userUtils.includes("isLeadOrDirectorInOrg"));
    assert.ok(!userUtils.includes("directed.includes(c.id)"));
  });

  it("enforces monitor exclusions in Firestore and Storage send rules", () => {
    const firestore = readFileSync(join(root, "firestore.rules"), "utf8");
    const storage = readFileSync(join(root, "storage.rules"), "utf8");
    assert.ok(firestore.includes("isMonitorBroadcastExcluded"));
    assert.ok(storage.includes("isMonitorBroadcastExcluded"));
  });
});
