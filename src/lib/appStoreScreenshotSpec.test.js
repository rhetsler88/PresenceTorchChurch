import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findSlot, findUploadProblems, SLOTS } from "./appStoreScreenshotSpec.js";

/** A file that App Store Connect accepts, varied per case. */
function uploadable(overrides = {}) {
  return {
    format: "jpeg",
    width: 1320,
    height: 2868,
    channels: 3,
    hasAlpha: false,
    space: "srgb",
    isProgressive: false,
    bytes: 240_000,
    ...overrides,
  };
}

describe("findSlot", () => {
  it("matches every size we export", () => {
    for (const slot of SLOTS) {
      assert.equal(findSlot(slot.width, slot.height)?.dir, slot.dir);
    }
  });

  it("keeps the two 1242-wide sizes in different slots", () => {
    assert.equal(findSlot(1242, 2208).label, '5.5" Display');
    assert.equal(findSlot(1242, 2688).label, '6.5" Display (alternate)');
  });

  it("returns null for a size Apple does not list", () => {
    assert.equal(findSlot(1179, 2556), null);
    assert.equal(findSlot(2868, 1320), null, "landscape is a different slot");
  });
});

describe("findUploadProblems", () => {
  it("passes a flattened baseline JPEG at an accepted size", () => {
    assert.deepEqual(findUploadProblems(uploadable()), []);
  });

  it("passes PNG too, since Apple takes either", () => {
    assert.deepEqual(findUploadProblems(uploadable({ format: "png" })), []);
  });

  it("rejects a format Apple does not take", () => {
    const [problem] = findUploadProblems(uploadable({ format: "webp" }));
    assert.match(problem, /only JPG or PNG/);
  });

  it("rejects an off-spec size", () => {
    const [problem] = findUploadProblems(uploadable({ width: 1179, height: 2556 }));
    assert.match(problem, /1179x2556 is not an accepted slot size/);
  });

  it("rejects transparency, whether flagged or implied by a fourth channel", () => {
    assert.match(findUploadProblems(uploadable({ hasAlpha: true }))[0], /alpha channel/);
    assert.match(findUploadProblems(uploadable({ channels: 4 }))[0], /alpha channel/);
  });

  it("rejects a non-RGB color space", () => {
    assert.match(findUploadProblems(uploadable({ space: "cmyk" }))[0], /Apple needs RGB/);
    assert.match(findUploadProblems(uploadable({ space: "b-w", channels: 1 }))[0], /Apple needs RGB/);
  });

  it("flags progressive encoding", () => {
    assert.match(findUploadProblems(uploadable({ isProgressive: true }))[0], /baseline/);
  });

  it("flags files past the 8MB cap and files too small to be real", () => {
    assert.match(findUploadProblems(uploadable({ bytes: 9 * 1024 * 1024 }))[0], /over the 8MB cap/);
    assert.match(findUploadProblems(uploadable({ bytes: 512 }))[0], /broken download/);
  });

  it("reports every problem at once so one upload attempt fixes them all", () => {
    const problems = findUploadProblems(
      uploadable({ format: "webp", width: 900, height: 1600, hasAlpha: true, isProgressive: true }),
    );
    assert.equal(problems.length, 4);
  });
});
