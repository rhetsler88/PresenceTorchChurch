import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { protectionSetAllTargets } from "./protectionSetAllCore.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const channels = [
  { id: "a1", organization: "Acme" },
  { id: "a2", organization: "Acme" },
  { id: "b1", organization: "Beta" },
  { id: "open", organization: "" },
];

describe("protectionSetAllTargets", () => {
  it("org admin gets only their org channels (plus empty-org channels)", () => {
    const ids = protectionSetAllTargets(channels, { role: "admin", organization: "Acme" });
    assert.deepEqual(new Set(ids), new Set(["a1", "a2", "open"]));
  });

  it("super admin gets all channel ids", () => {
    const ids = protectionSetAllTargets(channels, { role: "super_admin", organization: "Acme" });
    assert.deepEqual(new Set(ids), new Set(["a1", "a2", "b1", "open"]));
  });

  it("lead with no org match gets an empty list", () => {
    const namedOrgsOnly = channels.filter((c) => c.organization === "Acme" || c.organization === "Beta");
    const ids = protectionSetAllTargets(namedOrgsOnly, { role: "lead", organization: "Gamma" });
    assert.deepEqual(ids, []);
  });

  it("empty input returns empty output", () => {
    assert.deepEqual(protectionSetAllTargets([], { role: "admin", organization: "Acme" }), []);
    assert.deepEqual(protectionSetAllTargets(channels, null), []);
  });

  it("Monitor and Channels do not call updateMany with an empty filter", () => {
    const monitor = readFileSync(join(root, "src/pages/Monitor.jsx"), "utf8");
    const channelsPage = readFileSync(join(root, "src/pages/Channels.jsx"), "utf8");
    assert.equal(monitor.includes("updateMany({}"), false);
    assert.equal(channelsPage.includes("updateMany({}"), false);
    assert.ok(monitor.includes("applyBulkProtectionLevelUpdate"));
    assert.ok(channelsPage.includes("applyBulkProtectionLevelUpdate"));
  });
});
