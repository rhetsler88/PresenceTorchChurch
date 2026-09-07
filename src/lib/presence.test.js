import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("presence", () => {
  it("uses RTDB onDisconnect instead of Firestore heartbeats", () => {
    const source = readFileSync(join(root, "src/lib/presence.js"), "utf8");
    assert.ok(source.includes("onDisconnect(channelRef).remove()"));
    assert.ok(source.includes(".info/connected"));
    assert.ok(!source.includes("PRESENCE_HEARTBEAT_MS"));
    assert.ok(!source.includes("setInterval"));
    assert.ok(!source.includes("serverTimestamp()"));
  });

  it("treats only state online as present in Firestore mirror", () => {
    const source = readFileSync(join(root, "src/lib/presence.js"), "utf8");
    assert.ok(source.includes('data?.state === "online"'));
    assert.ok(source.includes("export function isPresenceFresh"));
  });

  it("publishes monitor listen channels on every route", () => {
    const source = readFileSync(join(root, "src/components/presence/PresenceProvider.jsx"), "utf8");
    assert.ok(source.includes("const listenChannelIds = passiveMonitor?.listenChannelIds || []"));
    assert.ok(!source.includes("onMonitorRoute"));
  });

  it("includes the signed-in talk user while publishing presence", () => {
    const hook = readFileSync(join(root, "src/hooks/useChannelPresence.js"), "utf8");
    const talk = readFileSync(join(root, "src/pages/Talk.jsx"), "utf8");
    assert.ok(hook.includes("includeCurrentUser"));
    assert.ok(talk.includes("includeCurrentUser: canPublishPresence"));
  });

  it("allows channel readers to query presence and blocks client writes", () => {
    const rules = readFileSync(join(root, "firestore.rules"), "utf8");
    assert.ok(rules.includes("function canReadChannelPresence(channelId)"));
    assert.ok(rules.includes("&& canReadChannelPresence(resource.data.channel_id)"));
    assert.ok(rules.includes("allow create, update, delete: if false"));
  });

  it("mirrors RTDB presence into Firestore via Cloud Function", () => {
    const source = readFileSync(join(root, "functions/presenceSync.js"), "utf8");
    assert.ok(source.includes("onValueWritten"));
    assert.ok(source.includes("/presence/{uid}/channels/{channelId}"));
    assert.ok(source.includes('state: "online"'));
  });

  it("exports Realtime Database from firebase client config", () => {
    const source = readFileSync(join(root, "src/lib/firebase.js"), "utf8");
    assert.ok(source.includes("databaseURL"));
    assert.ok(source.includes("export const rtdb"));
  });
});
