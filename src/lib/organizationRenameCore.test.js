import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findOrganizationNameConflict,
  idsMatchingOrganizationName,
  organizationNamesMatch,
} from "./organizationRenameCore.js";

describe("organizationRenameCore", () => {
  it("matches organization names case-insensitively", () => {
    assert.equal(
      organizationNamesMatch("Potter's House - Columbus", "potter's house - columbus"),
      true
    );
  });

  it("collects ids for records tied to the old org name", () => {
    const users = [
      { id: "u1", organization: "Acme" },
      { id: "u2", organization: "acme" },
      { id: "u3", organization: "Beta" },
    ];
    assert.deepEqual(idsMatchingOrganizationName("Acme", users), ["u1", "u2"]);
  });

  it("detects duplicate org display names", () => {
    const orgs = [
      { id: "a", name: "Acme" },
      { id: "b", name: "Beta" },
    ];
    assert.equal(findOrganizationNameConflict(orgs, "a", "beta")?.id, "b");
    assert.equal(findOrganizationNameConflict(orgs, "a", "Acme Next"), null);
  });
});
