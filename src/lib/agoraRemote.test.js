import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("Agora remote playback recovery", () => {
  it("retries play after autoplay failure and app resume", () => {
    const remote = readFileSync(join(root, "src/lib/agoraRemote.js"), "utf8");
    assert.ok(remote.includes("export function replayActiveRemoteTracks"));
    assert.ok(remote.includes("trackRemoteAudio(audioTrack, speakerUserId, channelId)"));

    const init = readFileSync(join(root, "src/lib/agoraInit.js"), "utf8");
    assert.ok(init.includes("AgoraRTC.onAutoplayFailed"));
    assert.ok(init.includes("replayActiveRemoteTracks()"));

    const resume = readFileSync(join(root, "src/lib/appResume.js"), "utf8");
    assert.ok(resume.includes("replayActiveRemoteTracks()"));
    assert.ok(resume.includes("ptt-audio-session"));
    assert.ok(resume.includes("ptt-audio-unlocked"));
  });

  it("prepares the native audio session before Agora join", () => {
    const multi = readFileSync(join(root, "src/hooks/useAgoraMultiListen.js"), "utf8");
    assert.ok(multi.includes("prepareNativeAgoraAudio()"));
    assert.ok(multi.includes("releaseNativeAgoraAudio()"));

    const ptt = readFileSync(join(root, "src/hooks/useAgoraPTT.js"), "utf8");
    assert.ok(ptt.includes("prepareNativeAgoraAudio()"));

    const agora = readFileSync(join(root, "src/lib/agora.js"), "utf8");
    assert.ok(agora.includes("Capacitor.isNativePlatform()"));
    assert.ok(agora.includes("VITE_AGORA_DISABLED"));

    const remote = readFileSync(join(root, "src/lib/agoraRemote.js"), "utf8");
    assert.ok(!remote.includes("refreshNativeAgoraAudio"));

    const broadcast = readFileSync(join(root, "src/hooks/usePttBroadcast.js"), "utf8");
    assert.ok(broadcast.includes("settleWithin"));
  });
});
