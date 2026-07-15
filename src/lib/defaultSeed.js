import seedData from "../../scripts/seed-data.json";

export { seedData };

export function isDefaultSetupComplete(orgs, channels) {
  const orgIds = new Set(orgs.map((o) => o.id));
  const channelIds = new Set(channels.map((c) => c.id));
  return (
    seedData.organizations.every((o) => orgIds.has(o.id)) &&
    seedData.channels.every((c) => channelIds.has(c.id))
  );
}

export function missingDefaultSummary(orgs, channels) {
  const orgIds = new Set(orgs.map((o) => o.id));
  const channelIds = new Set(channels.map((c) => c.id));
  return {
    organizations: seedData.organizations.filter((o) => !orgIds.has(o.id)).length,
    channels: seedData.channels.filter((c) => !channelIds.has(c.id)).length,
  };
}
