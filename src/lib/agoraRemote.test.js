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
  });
});
