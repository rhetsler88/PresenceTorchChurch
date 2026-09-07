import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("live PTT", () => {
  it("uses Agora for live audio with storage relay as archive-only fallback", () => {
    const broadcast = readFileSync(join(root, "src/hooks/usePttBroadcast.js"), "utf8");
    assert.ok(!broadcast.includes("preferNativeRelayLive"));
    assert.ok(broadcast.includes("useArchiveOnly = agoraEnabled && publishIds.length > 0"));
    assert.ok(broadcast.includes("settleWithin"));
    assert.ok(broadcast.includes("relay.enableLiveRelay"));
  });

  it("keeps relay receive enabled as fallback alongside Agora", () => {
    const receiver = readFileSync(join(root, "src/hooks/usePttReceiver.js"), "utf8");
    assert.ok(receiver.includes("const relayEnabled = enabled"));
    assert.ok(!receiver.includes("enabled && !agoraEnabled"));
  });

  it("can recover live relay on native when Agora publish fails", () => {
    const relay = readFileSync(join(root, "src/hooks/useRelayBroadcast.js"), "utf8");
    assert.ok(relay.includes("Native uses one recorder"));
    assert.ok(relay.includes("recorder.requestData()"));
  });

  it("clears busy state when a PTT signal is deleted", () => {
    const source = readFileSync(join(root, "src/hooks/usePttBusyChannels.js"), "utf8");
    assert.ok(source.includes('if (event.type === "delete")'));
    assert.ok(source.includes("markIdle(channelId)"));
  });
});
