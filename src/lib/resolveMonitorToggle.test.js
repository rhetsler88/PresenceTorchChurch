import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveMonitorToggle } from "./resolveMonitorToggle.js";

describe("resolveMonitorToggle", () => {
  it("demotes dedicated monitor role when turning off", () => {
    assert.deepEqual(
      resolveMonitorToggle({ user: { role: "monitor" }, turningOn: false }),
      { is_monitor: false, role: "user" }
    );
  });

  it("clears is_monitor only when turning off a non-monitor role", () => {
    assert.deepEqual(
      resolveMonitorToggle({ user: { role: "admin" }, turningOn: false }),
      { is_monitor: false }
    );
  });

  it("sets is_monitor when turning on", () => {
    assert.deepEqual(
      resolveMonitorToggle({ user: { role: "user" }, turningOn: true }),
      { is_monitor: true }
    );
  });
});
