import assert from "node:assert/strict";
import { describe, it, mock, afterEach } from "node:test";
import { PTT_MAX_TRANSMISSION_MS, armPttMaxTransmission, clearPttMaxTransmission } from "./pttLimits.js";

describe("PTT max transmission timer", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("uses a 35 second cutoff constant", () => {
    assert.equal(PTT_MAX_TRANSMISSION_MS, 35000);
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
