import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it, mock, afterEach } from "node:test";
import { fileURLToPath } from "node:url";
import { PTT_MAX_TRANSMISSION_MS, armPttMaxTransmission, clearPttMaxTransmission } from "./pttLimits.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("PTT max transmission timer", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("uses a 35 second cutoff constant", () => {
    assert.equal(PTT_MAX_TRANSMISSION_MS, 35000);
  });

  it("Talk playback receiving safety timeout matches max transmission", () => {
    const talk = readFileSync(join(root, "src/pages/Talk.jsx"), "utf8");
    assert.ok(talk.includes("PTT_MAX_TRANSMISSION_MS"));
    assert.equal(talk.includes("30000"), false);
    assert.match(
      talk,
      /receivingTimeoutRef\.current = setTimeout\([\s\S]*?,\s*PTT_MAX_TRANSMISSION_MS\s*\)/
    );
  });

  it("fires the handler after 35 seconds from mic live (not Agora publish)", () => {
    const timerRef = { current: null };
    let fired = false;
    const originalWindow = globalThis.window;

    globalThis.window = {
      setTimeout: (fn, ms) => {
        assert.equal(ms, PTT_MAX_TRANSMISSION_MS);
        fn();
        return 1;
      },
      clearTimeout: () => {},
    };

    try {
      armPttMaxTransmission(timerRef, () => {
        fired = true;
      });
      assert.equal(fired, true);
      clearPttMaxTransmission(timerRef);
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
