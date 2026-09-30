import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { partitionBroadcastTargets } from "./partitionBroadcastTargets.js";

describe("partitionBroadcastTargets", () => {
  const busy = new Set(["b", "c"]);

  it("returns all targets as free when none are busy", () => {
    const { freeIds, busyIds } = partitionBroadcastTargets(["a", "d"], busy);
    assert.deepEqual(freeIds, ["a", "d"]);
    assert.deepEqual(busyIds, []);
  });

  it("splits busy and free targets correctly", () => {
    const { freeIds, busyIds } = partitionBroadcastTargets(["a", "b", "c", "d"], busy);
    assert.deepEqual(freeIds, ["a", "d"]);
    assert.deepEqual(busyIds, ["b", "c"]);
  });

  it("returns an empty free list when every target is busy", () => {
    const { freeIds, busyIds } = partitionBroadcastTargets(["b", "c"], busy);
    assert.deepEqual(freeIds, []);
    assert.deepEqual(busyIds, ["b", "c"]);
  });
});
