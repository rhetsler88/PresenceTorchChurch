import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Mirrors playClearToneNow dedup in pttTones.js */
function shouldSkipClearTone({ broadcastId, now, lastClearToneAt, lastByBroadcast }) {
  if (broadcastId) {
    const lastForBroadcast = lastByBroadcast.get(broadcastId);
    if (lastForBroadcast != null && now - lastForBroadcast < 800) return true;
    return false;
  }
  return now - lastClearToneAt < 800;
}

describe("clear tone dedup", () => {
  it("allows different broadcast ids within 800ms (Firestore + page listeners)", () => {
    const lastByBroadcast = new Map([["a", 1000]]);
    assert.equal(
      shouldSkipClearTone({
        broadcastId: "b",
        now: 1200,
        lastClearToneAt: 1000,
        lastByBroadcast,
      }),
      false
    );
  });

  it("dedupes duplicate listeners for the same broadcast id", () => {
    const lastByBroadcast = new Map([["a", 1000]]);
    assert.equal(
      shouldSkipClearTone({
        broadcastId: "a",
        now: 1500,
        lastClearToneAt: 1000,
        lastByBroadcast,
      }),
      true
    );
  });

  it("allows replay after 800ms for the same broadcast id", () => {
    const lastByBroadcast = new Map([["a", 1000]]);
    assert.equal(
      shouldSkipClearTone({
        broadcastId: "a",
        now: 1801,
        lastClearToneAt: 1000,
        lastByBroadcast,
      }),
      false
    );
  });

  it("dedupes missing broadcast id globally within 800ms", () => {
    assert.equal(
      shouldSkipClearTone({
        broadcastId: null,
        now: 1500,
        lastClearToneAt: 1000,
        lastByBroadcast: new Map(),
      }),
      true
    );
  });
});
