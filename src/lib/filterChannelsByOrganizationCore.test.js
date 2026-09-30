import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterChannelsByOrganization } from "./filterChannelsByOrganizationCore.js";

const mixedOrgChannels = [
  { id: "a1", organization: "Acme" },
  { id: "a2", organization: "Acme" },
  { id: "b1", organization: "Beta" },
  { id: "open", organization: "" },
];

describe("filterChannelsByOrganization", () => {
  it("org users see only their org channels (plus empty-org channels)", () => {
    const visible = filterChannelsByOrganization(
      { role: "admin", organization: "Acme" },
      mixedOrgChannels
    );
    assert.deepEqual(
      visible.map((c) => c.id),
      ["a1", "a2", "open"]
    );
  });

  it("super admins see every channel", () => {
    const visible = filterChannelsByOrganization(
      { role: "super_admin", organization: "Acme" },
      mixedOrgChannels
    );
    assert.deepEqual(visible, mixedOrgChannels);
  });
});
