import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("presence", () => {
  it("uses Discord-style ~1 minute heartbeat and 90s stale window", () => {
    const source = readFileSync(join(root, "src/lib/presence.js"), "utf8");
    assert.ok(source.includes("export const PRESENCE_HEARTBEAT_MS = 60 * 1000"));
    assert.ok(source.includes("export const PRESENCE_STALE_MS = 90 * 1000"));
    assert.ok(source.includes("export function isPresenceFresh"));
  });

  it("keeps background presence while passive listen registrations remain", () => {
    const source = readFileSync(join(root, "src/lib/presence.js"), "utf8");
    assert.ok(source.includes("function handleBackground()"));
    assert.ok(source.includes("if (!enabled || channelIds.length === 0)"));
    assert.ok(source.includes("void clearPresence();"));
  });

  it("publishes monitor listen channels on every route", () => {
    const source = readFileSync(join(root, "src/components/presence/PresenceProvider.jsx"), "utf8");
    assert.ok(source.includes("const listenChannelIds = passiveMonitor?.listenChannelIds || []"));
    assert.ok(!source.includes("onMonitorRoute"));
  });

  it("subscribes to Firestore presence without injecting the signed-in user", () => {
    const hook = readFileSync(join(root, "src/hooks/useChannelPresence.js"), "utf8");
    const talk = readFileSync(join(root, "src/pages/Talk.jsx"), "utf8");
    assert.ok(!hook.includes("includeCurrentUser"));
    assert.ok(talk.includes("canViewPresence"));
    assert.ok(!talk.includes("includeCurrentUser"));
  });

  it("allows channel readers to query presence in Firestore rules", () => {
    const rules = readFileSync(join(root, "firestore.rules"), "utf8");
    assert.ok(rules.includes("function canReadChannelPresence(channelId)"));
    assert.ok(rules.includes("&& canReadChannelPresence(resource.data.channel_id)"));
  });
});
