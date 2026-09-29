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
    assert.ok(relay.includes("extensionForRecordingMime"));
    assert.ok(relay.includes('stage: "empty-recording"'));
  });

  it("claims the channel before opening the mic on Talk", () => {
    const talk = readFileSync(join(root, "src/pages/Talk.jsx"), "utf8");
    const claimIdx = talk.indexOf("await claimPttChannels");
    const recordIdx = talk.indexOf("await startRecording({ broadcastId");
    assert.ok(claimIdx >= 0 && recordIdx >= 0 && claimIdx < recordIdx);
    assert.ok(talk.includes('toast.error("Channel busy")'));
  });

  it("stops the Talk recorder if membership sync fails before stopRecording on send", () => {
    const talk = readFileSync(join(root, "src/pages/Talk.jsx"), "utf8");
    assert.ok(talk.includes("recordingFinalized"));
    assert.ok(talk.includes('stage: "membership-sync"'));
    assert.ok(talk.includes("if (!recordingFinalized)"));
    assert.ok(talk.includes("discardPttRecording(stopRecording"));
  });

  it("finishes the clear tone before startRecording on local PTT press", () => {
    const tones = readFileSync(join(root, "src/lib/pttTones.js"), "utf8");
    assert.ok(tones.includes("CLEAR_TONE_SEQUENCE_MS = 300"));
    assert.ok(tones.includes("await Promise.all"));
    for (const rel of ["src/pages/Talk.jsx", "src/pages/Monitor.jsx", "src/hooks/useGlobalPTT.js"]) {
      const source = readFileSync(join(root, rel), "utf8");
      assert.ok(source.includes("await clearToneDone"), rel);
      const toneIdx = source.indexOf("clearToneDone = playClearTone");
      const awaitToneIdx = source.indexOf("await clearToneDone");
      const recordIdx = source.indexOf("await startRecording");
      assert.ok(toneIdx >= 0 && awaitToneIdx >= 0 && recordIdx >= 0, rel);
      assert.ok(awaitToneIdx < recordIdx, rel);
    }
  });

  it("clears busy state when a PTT signal is deleted", () => {
    const source = readFileSync(join(root, "src/hooks/usePttBusyChannels.js"), "utf8");
    assert.ok(source.includes('if (event.type === "delete")'));
    assert.ok(source.includes("markIdle(channelId)"));
  });
});
