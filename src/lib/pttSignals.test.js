import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("pttSignals", () => {
  it("uses transactional sequential claims with rollback in claimPttChannels", () => {
    const source = readFileSync(join(root, "src/lib/pttSignals.js"), "utf8");
    assert.ok(source.includes("runTransaction"));
    assert.ok(source.includes("for (const channelId of ids)"));
    assert.ok(source.includes("await releasePttSignals(createdIds)"));
    assert.ok(source.includes("won: false"));
    assert.ok(source.includes("isStaleFirestoreSignal"));
  });

  it("exports discard helper for startup abort paths", () => {
    const source = readFileSync(join(root, "src/lib/pttSignals.js"), "utf8");
    assert.ok(source.includes("discardPttRecording"));
    assert.ok(source.includes("ptt-recording-discarded"));
  });

  it("Talk, Monitor, and global PTT check won before starting the mic", () => {
    for (const rel of ["src/pages/Talk.jsx", "src/pages/Monitor.jsx", "src/hooks/useGlobalPTT.js"]) {
      const source = readFileSync(join(root, rel), "utf8");
      assert.ok(source.includes("if (!claimResult.won)"), rel);
      assert.ok(source.includes('toast.error("Channel busy")'), rel);
      const claimIdx = source.indexOf("await claimPttChannels");
      const recordIdx = source.indexOf("await startRecording");
      assert.ok(claimIdx >= 0 && recordIdx >= 0 && claimIdx < recordIdx, rel);
    }
  });
});
