import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { leaveChannelUpdates } from "./leaveChannelUpdatesCore.js";

const channel = {
  id: "ch-1",
  members: ["uid-a", "other@example.com", "uid-b"],
  pending_members: ["uid-pending", "wait@example.com"],
};

describe("leaveChannelUpdates", () => {
  it("removes the uid from members and clears member_of_channels on the user", () => {
    const result = leaveChannelUpdates({
      channel,
      userId: "uid-a",
      email: "a@example.com",
      intent: "leave",
    });
    assert.deepEqual(result.channel.members, ["other@example.com", "uid-b"]);
    assert.deepEqual(result.user, { member_of_channels: { remove: "ch-1" } });
  });

  it("removes the email entry from members", () => {
    const result = leaveChannelUpdates({
      channel,
      userId: "uid-x",
      email: "other@example.com",
      intent: "leave",
    });
    assert.deepEqual(result.channel.members, ["uid-a", "uid-b"]);
    assert.deepEqual(result.user?.member_of_channels?.remove, "ch-1");
  });

  it("removes pending membership entries when withdrawing", () => {
    const result = leaveChannelUpdates({
      channel: { id: "ch-1", pending_members: ["uid-pending", "wait@example.com"] },
      userId: "uid-pending",
      email: "other@example.com",
      intent: "withdraw",
    });
    assert.deepEqual(result.channel.pending_members, ["wait@example.com"]);
    assert.equal(result.user, null);
  });
});
