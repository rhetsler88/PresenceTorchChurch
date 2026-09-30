import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { assertPlayableSendPayload } from "./playableSendPayload.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("assertPlayableSendPayload", () => {
  it("passes a complete result through untouched", () => {
    const result = {
      file_url: "https://example.com/audio.webm",
      file_uri: "gs://bucket/path",
      duration: 3.2,
      broadcast_id: "b1",
    };
    assert.deepEqual(assertPlayableSendPayload(result), result);
  });

  it("throws app/upload-failed with retryable when only file_uri is present", () => {
    assert.throws(
      () => assertPlayableSendPayload({ file_uri: "gs://bucket/path", duration: 1 }),
      (err) => err.code === "app/upload-failed" && err.retryable === true
    );
  });

  it("throws app/recording-failed for null", () => {
    assert.throws(
      () => assertPlayableSendPayload(null),
      (err) => err.code === "app/recording-failed"
    );
  });

  it("Talk send flow uses assertPlayableSendPayload before VoiceMessage.create", () => {
    const talk = readFileSync(join(root, "src/pages/Talk.jsx"), "utf8");
    assert.ok(talk.includes("assertPlayableSendPayload"));
    assert.ok(talk.includes("createVoiceMessageArchive"));
    assert.match(talk, /sendMutation[\s\S]*?createVoiceMessageArchive/);
    assert.doesNotMatch(
      talk,
      /const result = await stopRecording\(\);[\s\S]*?VoiceMessage\.create/
    );
  });
});
