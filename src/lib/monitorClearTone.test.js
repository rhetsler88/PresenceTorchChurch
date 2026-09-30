import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldPlayClearTone } from "./monitorClearTone.js";

describe("shouldPlayClearTone", () => {
  const muted = new Set(["ch-muted"]);

  it("returns false when the channel is muted", () => {
    assert.equal(
      shouldPlayClearTone({ channelId: "ch-muted", mutedChannelIds: muted }),
      false
    );
  });

  it("returns true when the channel is not muted", () => {
    assert.equal(
      shouldPlayClearTone({ channelId: "ch-live", mutedChannelIds: muted }),
      true
    );
  });

  it("returns true when channel id is unknown", () => {
    assert.equal(shouldPlayClearTone({ channelId: null, mutedChannelIds: muted }), true);
    assert.equal(shouldPlayClearTone({ channelId: undefined, mutedChannelIds: muted }), true);
    assert.equal(shouldPlayClearTone({ channelId: "", mutedChannelIds: muted }), true);
  });
});
