import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Mirrors VoiceMessage.filter over-fetch in api/client.js */
function monitorMessageFetchLimit(displayCount = 3) {
  return Math.max(displayCount * 5, displayCount + 8);
}

function isPlayReviewerMessage(message) {
  return message.sender_name?.trim() === "Play Store Reviewer";
}

function takeVisibleRecentMessages(messages = [], displayCount = 3) {
  return messages.filter((message) => !isPlayReviewerMessage(message)).slice(0, displayCount);
}

describe("monitor recent messages", () => {
  it("over-fetches enough rows before filtering to 3 visible", () => {
    assert.equal(monitorMessageFetchLimit(3), 15);
  });

  it("returns 3 visible messages after dropping reviewer rows", () => {
    const messages = [
      { id: "1", sender_name: "Play Store Reviewer", created_date: "2026-09-05T10:00:00Z" },
      { id: "2", sender_name: "Alice", created_date: "2026-09-05T09:00:00Z" },
      { id: "3", sender_name: "Play Store Reviewer", created_date: "2026-09-05T08:00:00Z" },
      { id: "4", sender_name: "Bob", created_date: "2026-09-05T07:00:00Z" },
      { id: "5", sender_name: "Carol", created_date: "2026-09-05T06:00:00Z" },
    ];
    const visible = takeVisibleRecentMessages(messages, 3);
    assert.equal(visible.length, 3);
    assert.deepEqual(visible.map((m) => m.id), ["2", "4", "5"]);
  });
});
