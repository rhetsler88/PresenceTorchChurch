import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { toast } from "sonner";

export function useBootstrapDatabase(user, { autoSeed = false } = {}) {
  const queryClient = useQueryClient();
  const autoSeedAttempted = useRef(false);

  const { data: orgs = [], isLoading: orgsLoading } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.organizations.list(),
  });

  const { data: channels = [], isLoading: channelsLoading } = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.entities.Channel.list("-created_date", 200),
  });

  const needsSeed = orgs.length === 0 || channels.length === 0;

  const canInitialize =
    user?.role === "super_admin" ||
    (user?.role === "admin" && orgs.length > 0 && channels.length === 0);

  const seedMutation = useMutation({
    mutationFn: () => api.bootstrap.seedDefaults(),
    onSuccess: (result) => {
      queryClient.invalidateQueries();
      if (result.seeded) {
        const parts = [];
        if (result.organizations) parts.push(`${result.organizations} organization(s)`);
        if (result.channels) parts.push(`${result.channels} channel(s)`);
        toast.success(`Initialized ${parts.join(" and ")}`);
      } else {
        toast.info(result.message);
      }
    },
    onError: (err) => toast.error(err.message || "Couldn't initialize database"),
  });

  const canAutoSeed =
    autoSeed &&
    (user?.role === "super_admin" || (user?.role === "admin" && orgs.length > 0));

  useEffect(() => {
    if (!canAutoSeed) return;
    if (autoSeedAttempted.current) return;
    if (orgsLoading || channelsLoading) return;
    if (!needsSeed) return;
    autoSeedAttempted.current = true;
    seedMutation.mutate();
  }, [canAutoSeed, orgsLoading, channelsLoading, needsSeed]);

  return {
    orgs,
    channels,
    orgsLoading,
    channelsLoading,
    needsSeed,
    canInitialize,
    seedMutation,
  };
}
