import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

/** Shared React Query key — invalidate with this prefix after channel mutations. */
export const CHANNELS_QUERY_KEY = ["channels"];

/** Avoid refetching the channel list on every mount while data is still fresh. */
export const CHANNELS_STALE_TIME_MS = 60_000;

/** Covers Talk/Monitor (50), Channels/Admin (100), and super-admin dashboard (200). */
const DEFAULT_CHANNEL_LIMIT = 200;

/**
 * Shared channel list query used across Talk, Monitor, providers, and admin surfaces.
 */
export default function useChannels({ enabled = true, limit = DEFAULT_CHANNEL_LIMIT } = {}) {
  return useQuery({
    queryKey: CHANNELS_QUERY_KEY,
    queryFn: () => api.entities.Channel.list("-created_date", limit),
    enabled,
    staleTime: CHANNELS_STALE_TIME_MS,
  });
}
