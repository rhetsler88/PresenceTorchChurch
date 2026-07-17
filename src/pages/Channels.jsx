import React, { useState, useEffect } from "react";
import { api } from "@/api/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Radio, Bell } from "lucide-react";
import ProtectionLevelControl from "@/components/monitor/ProtectionLevelControl";
import SetAllProtectionLevel from "@/components/monitor/SetAllProtectionLevel";
import ChannelCard from "../components/channels/ChannelCard";
import CreateChannelDialog from "../components/channels/CreateChannelDialog";
import RenameChannelDialog from "../components/channels/RenameChannelDialog";
import JoinChannelDialog from "../components/channels/JoinChannelDialog";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

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

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.entities.Channel.list("-created_date", 100),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.entities.Channel.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["channels"] }),
  });

  const joinChannelMutation = useMutation({
    mutationFn: async ({ channel }) => {
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

  const staffAlertMutation = useMutation({
    mutationFn: () => api.auth.updateMe({ pending_staff_alerts: true }),
    onSuccess: (updated) => {
      setUser(updated);
      toast.success("Staff alert request sent! An admin will review it.");
    },
    onError: () => toast.error("Couldn't send staff alert request"),
  });

  const renameMutation = useMutation({
    mutationFn: ({ channelId, name, color }) => api.entities.Channel.update(channelId, { name, color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast.success("Channel renamed");
    },
  });

  const protectionMutation = useMutation({
    mutationFn: ({ channelId, level }) => api.entities.Channel.update(channelId, { protection_level: level }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["channels"] }),
  });

  const setAllProtectionMutation = useMutation({
    mutationFn: (level) => api.entities.Channel.updateMany({}, { $set: { protection_level: level } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast.success("All channels updated");
    },
  });

  const canManageProtection =
    user?.role === "admin" ||
    user?.role === "super_admin" ||
    user?.role === "director";

  const handleSelect = (channel) => {
    if (channel.members?.includes(user?.id) || channel.members?.includes(user?.email)) {
      navigate(`/?channel=${channel.id}`);
      return;
    }
    if (
      channel.pending_members?.includes(user?.id) ||
      channel.pending_members?.includes(user?.email)
    ) {
      toast.info("Waiting for admin approval");
      return;
    }
    setJoinChannel(channel);
  };

  const showStaffAlertRequest =
    user &&
    !user.receives_staff_alerts &&
    !user.pending_staff_alerts &&
    !canManageProtection;

  return (
    <div className="min-h-screen safe-top">
      <div className="px-4 pt-4 pb-3 sm:px-5 sm:pt-6">
        <div className={`flex items-center justify-between mb-3 ${canManageProtection ? "pr-12" : ""}`}>
          <div>
            <h1 className="text-xl font-bold text-foreground">Channels</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{channels.length} channels</p>
          </div>
          <div className="flex items-center gap-2">
            {canManageProtection && (
              <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
                <Plus className="w-4 h-4" />
                New
              </Button>
            )}
          </div>
        </div>
        {!canManageProtection && channels.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground mb-4">
              Tap a channel to request full PTT access.
            </p>
            <div className="flex justify-center mb-5">
              <SetAllProtectionLevel onApply={(level) => setAllProtectionMutation.mutateAsync(level)} />
            </div>
          </>
        )}
      </div>

      <div className="px-3 pb-24">
        {showStaffAlertRequest && (
          <div className="mb-4 p-4 rounded-xl border border-red-500/20 bg-red-500/5">
            <div className="flex items-start gap-3">
              <Bell className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Staff Code Red alerts</p>
                <p className="text-xs text-muted-foreground mt-1">
                  For church staff who need alerts on any channel without PTT access.
                </p>
                <Button
                  size="sm"
                  className="mt-3"
                  disabled={staffAlertMutation.isPending}
                  onClick={() => staffAlertMutation.mutate()}
                >
                  Request staff alerts
                </Button>
              </div>
            </div>
          </div>
        )}

        {user?.pending_staff_alerts && !user?.receives_staff_alerts && (
          <p className="text-xs text-amber-500 mb-3 px-1">Staff alert request pending admin approval</p>
        )}

        {user?.receives_staff_alerts && (
          <p className="text-xs text-red-500 mb-3 px-1 flex items-center gap-1">
            <Bell className="w-3 h-3" /> Staff alerts enabled — all channels
          </p>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : channels.length > 0 ? (
          <div className="space-y-2">
            {channels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                isActive={channel.members?.includes(user?.id) || channel.members?.includes(user?.email)}
                isPending={
                  channel.pending_members?.includes(user?.id) ||
                  channel.pending_members?.includes(user?.email)
                }
                onSelect={handleSelect}
                isAdmin={user?.role === "admin" || user?.role === "super_admin"}
                onRename={(ch) => setRenameChannel(ch)}
                canManageProtection={canManageProtection}
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
