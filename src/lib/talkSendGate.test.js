import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertCanSendTextWithAccess,
  canSendTextWithAccess,
} from "./talkSendGateCore.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const channel = { id: "ch1", organization: "Org" };
const allowedUser = { id: "u1", role: "user", organization: "Org" };

const openAccess = {
  canSendOnChannel: () => true,
  bypassesDailyCode: () => false,
  isDailyCodeVerified: () => true,
};

describe("talkSendGate", () => {
  it("allowed user passes", () => {
    assert.equal(canSendTextWithAccess(allowedUser, channel, openAccess), true);
    assert.doesNotThrow(() => assertCanSendTextWithAccess(allowedUser, channel, openAccess));
  });

  it("missing channel permission fails", () => {
    const access = {
      ...openAccess,
      canSendOnChannel: () => false,
    };
    assert.equal(canSendTextWithAccess(allowedUser, channel, access), false);
    assert.throws(
      () => assertCanSendTextWithAccess(allowedUser, channel, access),
      (err) => err.code === "permission-denied"
    );
  });

  it("missing daily code fails for non-bypass users", () => {
    const access = {
      ...openAccess,
      isDailyCodeVerified: () => false,
    };
    assert.equal(canSendTextWithAccess(allowedUser, channel, access), false);
    assert.throws(
      () => assertCanSendTextWithAccess(allowedUser, channel, access),
      (err) => err.code === "daily-code-required"
    );
  });

  it("bypasses daily code when role skips verification", () => {
    const access = {
      canSendOnChannel: () => true,
      bypassesDailyCode: () => true,
      isDailyCodeVerified: () => false,
    };
    assert.equal(canSendTextWithAccess({ role: "lead" }, channel, access), true);
  });

  it("Talk sendTextMutation references the send gate", () => {
    const talk = readFileSync(join(root, "src/pages/Talk.jsx"), "utf8");
    assert.ok(talk.includes("assertCanSendText"));
    assert.match(talk, /mutationFn:[\s\S]*?assertCanSendText/);
    assert.ok(talk.includes("!canSendPtt"));
    assert.match(talk, /TextInputBar[\s\S]*disabled=\{[^}]*!canSendPtt/);
  });
});
