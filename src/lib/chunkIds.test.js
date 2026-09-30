import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chunkIds } from "./chunkIds.js";

describe("chunkIds", () => {
  it("returns no batches for an empty list", () => {
    assert.deepEqual(chunkIds([], 100), []);
  });

  it("keeps 99 ids in a single batch", () => {
    const ids = Array.from({ length: 99 }, (_, i) => `id-${i}`);
    assert.equal(chunkIds(ids, 100).length, 1);
    assert.equal(chunkIds(ids, 100)[0].length, 99);
  });

  it("splits exactly 100 ids into one batch", () => {
    const ids = Array.from({ length: 100 }, (_, i) => `id-${i}`);
    const batches = chunkIds(ids, 100);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].length, 100);
  });

  it("splits 101 ids into two batches", () => {
    const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    const batches = chunkIds(ids, 100);
    assert.equal(batches.length, 2);
    assert.equal(batches[0].length, 100);
    assert.equal(batches[1].length, 1);
  });

  it("splits 250 ids into three batches of 100, 100, and 50", () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const batches = chunkIds(ids, 100);
    assert.deepEqual(
      batches.map((b) => b.length),
      [100, 100, 50]
    );
  });
});
