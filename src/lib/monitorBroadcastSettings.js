const MONITOR_BROADCAST_MODE_KEY = "monitorBroadcastMode";
const MONITOR_BROADCAST_SELECTION_KEY = "monitorBroadcastSelection";

export function readStoredBroadcastMode() {
  const mode = localStorage.getItem(MONITOR_BROADCAST_MODE_KEY);
  return mode === "multi" ? "multi" : "single";
}

export function readStoredBroadcastSelection() {
  try {
    const saved = localStorage.getItem(MONITOR_BROADCAST_SELECTION_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : null;
  } catch {
    return null;
  }
}

export function resolveMonitorTargetChannelIds({
  sendableChannelIds,
  user,
}) {
  if (!sendableChannelIds?.length) return [];

  const broadcastMode = readStoredBroadcastMode();
  if (broadcastMode === "multi") {
    const stored = readStoredBroadcastSelection();
    const excluded = new Set(user?.broadcast_excluded_channels || []);
    const defaults = sendableChannelIds.filter((id) => !excluded.has(id));
    const fallback = defaults.length > 0 ? defaults : sendableChannelIds;

    if (stored) {
      const validStored = stored.filter((id) => sendableChannelIds.includes(id));
      if (validStored.length > 0) return validStored;
    }
    return fallback;
  }

  const lastId = localStorage.getItem("lastChannelId");
  if (lastId && sendableChannelIds.includes(lastId)) return [lastId];
  return [sendableChannelIds[0]];
}
