import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("live PTT", () => {
  it("uses native storage relay for live audio instead of archive-only Agora", () => {
    const broadcast = readFileSync(join(root, "src/hooks/usePttBroadcast.js"), "utf8");
    const receiver = readFileSync(join(root, "src/hooks/usePttReceiver.js"), "utf8");
    assert.ok(broadcast.includes("preferNativeRelayLive"));
    assert.ok(broadcast.includes("!preferNativeRelayLive"));
    assert.ok(receiver.includes("const relayEnabled = enabled"));
    assert.ok(!receiver.includes("enabled && !agoraEnabled"));
  });

  it("clears busy state when a PTT signal is deleted", () => {
    const source = readFileSync(join(root, "src/hooks/usePttBusyChannels.js"), "utf8");
    assert.ok(source.includes('if (event.type === "delete")'));
    assert.ok(source.includes("markIdle(channelId)"));
  });
});
