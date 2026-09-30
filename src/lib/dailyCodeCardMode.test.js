import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dailyCodeCardMode } from "./dailyCodeCardMode.js";

describe("dailyCodeCardMode", () => {
  it('returns "bypassed" for super admins without an organization', () => {
    assert.equal(
      dailyCodeCardMode({ role: "super_admin", organization: "" }),
      "bypassed"
    );
  });

  it('returns "code" for org admins with an organization', () => {
    assert.equal(
      dailyCodeCardMode({ role: "admin", organization: "Acme Church" }),
      "code"
    );
  });

  it('returns "no-org" for org-less leads', () => {
    assert.equal(dailyCodeCardMode({ role: "lead", organization: null }), "no-org");
  });
});
