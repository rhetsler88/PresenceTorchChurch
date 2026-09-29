import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extensionForRecordingMime } from "./recordingMime.js";

describe("recordingMime", () => {
  it("maps recording MIME types to file extensions (Android 3gpp must not be .webm)", () => {
    assert.equal(extensionForRecordingMime("audio/3gpp"), "3gp");
    assert.equal(extensionForRecordingMime("audio/mp4"), "m4a");
    assert.equal(extensionForRecordingMime("audio/webm"), "webm");
    assert.equal(extensionForRecordingMime("audio/webm;codecs=opus"), "webm");
    assert.equal(extensionForRecordingMime("audio/ogg"), "ogg");
    assert.equal(extensionForRecordingMime("audio/ogg;codecs=opus"), "ogg");
    assert.equal(extensionForRecordingMime("audio/unknown"), "webm");
  });
});
