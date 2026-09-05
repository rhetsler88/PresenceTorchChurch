import React, { useState, useEffect } from "react";
import { api } from "@/api/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import useChannels from "@/hooks/useChannels";
import { Button } from "@/components/ui/button";
import { Plus, Radio } from "lucide-react";
import SetAllProtectionLevel from "@/components/monitor/SetAllProtectionLevel";
import ChannelCard from "../components/channels/ChannelCard";
import CreateChannelDialog from "../components/channels/CreateChannelDialog";
import RenameChannelDialog from "../components/channels/RenameChannelDialog";
import JoinChannelDialog from "../components/channels/JoinChannelDialog";
import { useNavigate } from "react-router-dom";
import { toast } from "@/lib/toast";
import { addUserChannelMembership } from "@/lib/channelMembership";
import {
  recordProtectionLevelChange,
  recordProtectionLevelChanges,
} from "@/lib/protectionLevelHistory";
import {
  canAccessChannel,
  canCreateChannel,
  canEditAssignedChannel,
  canManageChannelProtection,
} from "@/lib/userUtils";

export default function Channels() {
  const [showCreate, setShowCreate] = useState(false);
  const [renameChannel, setRenameChannel] = useState(null);
  const [joinChannel, setJoinChannel] = useState(null);
  const [user, setUser] = useState(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    api.auth.me().then(setUser);
  }, []);

  // Sync force protection badges when levels change elsewhere (e.g. Monitor)
  useEffect(() => {
    const unsub = api.entities.Channel.subscribe((event) => {
      if (event.type === "update") {
        queryClient.invalidateQueries({ queryKey: ["channels"] });
      }
    });
    return unsub;
  }, [queryClient]);

  const { data: channels = [], isLoading } = useChannels();

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const channel = await api.entities.Channel.create(data);
      if (user?.id && (data.members || []).includes(user.id)) {
        await addUserChannelMembership(user.id, channel.id);
      }
      return channel;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["channels"] }),
  });

  const joinChannelMutation = useMutation({
    mutationFn: async (/** @type {{ channel: any }} */ { channel }) => {
      if (!user?.id) return;
      const pending = channel.pending_members || [];
      const approved = channel.members || [];
      const alreadyPending = pending.includes(user.id) || pending.includes(user.email);
      const alreadyApproved = approved.includes(user.id) || approved.includes(user.email);
      if (!alreadyPending && !alreadyApproved) {
        await api.entities.Channel.update(channel.id, {
          pending_members: [...pending, user.id],
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      setJoinChannel(null);
      toast.success("Request sent! Waiting for admin approval.");
    },
  });

  const renameMutation = useMutation({
    mutationFn: (/** @type {{ channelId: any, name: any, color: any }} */ { channelId, name, color }) => api.entities.Channel.update(channelId, { name, color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast.success("Channel renamed");
    },
  });

  const protectionMutation = useMutation({
    mutationFn: async (/** @type {{ channelId: any, level: any }} */ { channelId, level }) => {
      const channels = queryClient.getQueryData(["channels"]) || [];
      const channel = channels.find((c) => c.id === channelId);
      const fromLevel = channel?.protection_level || "green";
      await api.entities.Channel.update(channelId, { protection_level: level });
      await recordProtectionLevelChange({
        channelId,
        fromLevel,
        toLevel: level,
        queryClient,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["channels"] }),
  });

  const setAllProtectionMutation = useMutation({
    mutationFn: async (level) => {
      const channels = queryClient.getQueryData(["channels"]) || [];
      await api.entities.Channel.updateMany({}, { $set: { protection_level: level } });
      await recordProtectionLevelChanges(channels, level, queryClient);
      return level;
    },
    onSuccess: (_data, level) => {
      queryClient.setQueryData(["channels"], (/** @type {any[] | undefined} */ old) =>
        (old ?? []).map((c) => ({ ...c, protection_level: level }))
      );
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast.success("All channels updated");
    },
    onError: () => toast.error("Could not update protection levels"),
  });

  const showCreateButton = canCreateChannel(user);
  const canManageAnyProtection = channels.some((ch) => canManageChannelProtection(user, ch));
  const hasAssignedChannel = channels.some((ch) => canAccessChannel(user, ch));

  const handleOpenTalk = (channel) => {
    navigate(`/?channel=${channel.id}`);
  };

  const handleRequestAccess = (channel) => {
    if (
      channel.pending_members?.includes(user?.id) ||
      channel.pending_members?.includes(user?.email)
    ) {
      toast.info("Waiting for admin approval");
      return;
    }
    setJoinChannel(channel);
  };

  const channelsSubtitle = canManageAnyProtection
    ? "Select a channel to open in Talk"
    : hasAssignedChannel
      ? "Tap assigned channels to open in Talk"
      : "Request access to join a channel";

  return (
    <div className="w-full safe-top">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm px-4 pt-4 pb-4 border-b border-border sm:px-5 sm:pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between max-sm:pr-12 sm:pr-48">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground sm:text-xl">Channels</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {channelsSubtitle}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {canManageAnyProtection && channels.length > 0 && (
              <SetAllProtectionLevel onApply={(level) => setAllProtectionMutation.mutateAsync(level)} />
            )}
            {showCreateButton && (
              <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
                <Plus className="w-4 h-4" />
                New
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="w-full p-3 pb-36 sm:p-4">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : channels.length > 0 ? (
          <div className="flex flex-col gap-4 w-full">
            {channels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                isActive={canAccessChannel(user, channel)}
                isPending={
                  !canAccessChannel(user, channel) &&
                  (channel.pending_members?.includes(user?.id) ||
                    channel.pending_members?.includes(user?.email))
                }
                onOpenTalk={handleOpenTalk}
                onRequestAccess={handleRequestAccess}
                canRename={canEditAssignedChannel(user, channel)}
                onRename={(ch) => setRenameChannel(ch)}
                canManageProtection={canManageChannelProtection(user, channel)}
                protectionLevel={channel.protection_level || "green"}
                onProtectionChange={(level) => protectionMutation.mutateAsync({ channelId: channel.id, level })}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <Radio className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No channels yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Create your first channel</p>
          </div>
        )}
      </div>

      <CreateChannelDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreate={(data) => createMutation.mutateAsync(data)}
        userId={user?.id}
        organization={user?.organization}
      />

      <RenameChannelDialog
        open={!!renameChannel}
        onOpenChange={(v) => { if (!v) setRenameChannel(null); }}
        channel={renameChannel}
        onRename={(channelId, name, color) => renameMutation.mutateAsync({ channelId, name, color })}
      />

      <JoinChannelDialog
        open={!!joinChannel}
        channel={joinChannel}
        onOpenChange={(open) => { if (!open) setJoinChannel(null); }}
        loading={joinChannelMutation.isPending}
        onRequest={() => joinChannel && joinChannelMutation.mutate({ channel: joinChannel })}
      />
    </div>
  );
}
