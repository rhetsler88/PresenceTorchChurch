import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveChannelSwitch } from "./channelSwitchDuringPtt.js";

describe("resolveChannelSwitch", () => {
  it("applies immediately when not transmitting", () => {
    const result = resolveChannelSwitch({
      requestedId: "ch-b",
      currentId: "ch-a",
      isTransmitting: false,
    });
    assert.equal(result.action, "apply");
    assert.equal(result.channelId, "ch-b");
  });

  it("defers while transmitting without changing the active channel", () => {
    const result = resolveChannelSwitch({
      requestedId: "ch-b",
      currentId: "ch-a",
      isTransmitting: true,
    });
    assert.equal(result.action, "defer");
    assert.equal(result.pendingId, "ch-b");
    assert.equal(result.channelId, undefined);
  });

  it("applies the stashed id exactly once on settle", () => {
    const first = resolveChannelSwitch({
      settle: true,
      pendingId: "ch-b",
      isTransmitting: false,
    });
    assert.equal(first.action, "apply");
    assert.equal(first.channelId, "ch-b");
    assert.equal(first.pendingId, null);

    const second = resolveChannelSwitch({
      settle: true,
      pendingId: null,
      isTransmitting: false,
    });
    assert.equal(second.action, "none");
  });
});
