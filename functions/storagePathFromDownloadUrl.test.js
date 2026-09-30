import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const { storagePathFromDownloadUrl } = require("./storagePathFromDownloadUrl.js");

describe("storagePathFromDownloadUrl", () => {
  it("parses Firebase download URLs with encoded slashes and query strings", () => {
    const url =
      "https://firebasestorage.googleapis.com/v0/b/my-app.appspot.com/o/audio%2F2024%2Fmsg.webm?alt=media&token=abc-123";
    assert.equal(storagePathFromDownloadUrl(url), "audio/2024/msg.webm");
  });

  it("parses v1 download URLs with nested encoding", () => {
    const url =
      "https://firebasestorage.googleapis.com/v0/b/bucket/o/users%2Fu1%2Fvoice%20clip.mp3?alt=media";
    assert.equal(storagePathFromDownloadUrl(url), "users/u1/voice clip.mp3");
  });

  it("parses gs:// URIs and audio/ relative paths", () => {
    assert.equal(
      storagePathFromDownloadUrl("gs://my-bucket/audio/relay/chunk.webm"),
      "audio/relay/chunk.webm"
    );
    assert.equal(storagePathFromDownloadUrl("audio/ptt/file.ogg"), "audio/ptt/file.ogg");
  });

  it("returns null for missing or invalid input", () => {
    assert.equal(storagePathFromDownloadUrl(null), null);
    assert.equal(storagePathFromDownloadUrl(undefined), null);
    assert.equal(storagePathFromDownloadUrl(""), null);
    assert.equal(storagePathFromDownloadUrl("not-a-url"), null);
    assert.equal(storagePathFromDownloadUrl("https://example.com/file.webm"), null);
  });
});
