import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ensurePttAccess,
  invalidatePttAccess,
  PTT_ACCESS_TTL_MS,
} from "./pttAccessCache.js";

describe("pttAccessCache", () => {
  it("runs membership refresh only once within TTL", async () => {
    let refreshCount = 0;
    let ensureCount = 0;

    await ensurePttAccess({
      userId: "user-cache-test",
      channelId: "channel-a",
      refreshMembership: async () => { refreshCount += 1; },
      ensureMembership: async () => { ensureCount += 1; },
    });
    await ensurePttAccess({
      userId: "user-cache-test",
      channelId: "channel-a",
      refreshMembership: async () => { refreshCount += 1; },
      ensureMembership: async () => { ensureCount += 1; },
    });

    assert.equal(refreshCount, 1);
    assert.equal(ensureCount, 1);
    invalidatePttAccess("user-cache-test", "channel-a");
  });

  it("re-runs after invalidate", async () => {
    let refreshCount = 0;

    await ensurePttAccess({
      userId: "user-cache-test-2",
      channelId: "channel-b",
      refreshMembership: async () => { refreshCount += 1; },
    });
    invalidatePttAccess("user-cache-test-2", "channel-b");
    await ensurePttAccess({
      userId: "user-cache-test-2",
      channelId: "channel-b",
      refreshMembership: async () => { refreshCount += 1; },
    });

    assert.equal(refreshCount, 2);
    invalidatePttAccess("user-cache-test-2", "channel-b");
  });

  it("force bypasses cache", async () => {
    let refreshCount = 0;

    await ensurePttAccess({
      userId: "user-cache-test-3",
      channelId: "channel-c",
      refreshMembership: async () => { refreshCount += 1; },
    });
    await ensurePttAccess({
      userId: "user-cache-test-3",
      channelId: "channel-c",
      refreshMembership: async () => { refreshCount += 1; },
      force: true,
    });

    assert.equal(refreshCount, 2);
    invalidatePttAccess("user-cache-test-3", "channel-c");
  });

  it("exports a one minute TTL", () => {
    assert.equal(PTT_ACCESS_TTL_MS, 60_000);
  });
});
