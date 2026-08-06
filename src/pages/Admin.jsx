import React from "react";
import { api } from "@/api/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, Crown, User } from "lucide-react";
import UserRow, { ROLE_CONFIG } from "@/components/admin/UserRow";
import PendingRequests from "@/components/admin/PendingRequests";
import StaffAlertRequests from "@/components/admin/StaffAlertRequests";
import DailyCodeCard from "@/components/dailycode/DailyCodeCard";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import {
  isPlatformAdmin,
  filterUsersByOrganization,
  filterChannelsByOrganization,
} from "@/lib/userUtils";
import { addUserChannelMembership } from "@/lib/channelMembership";

function resolvePendingMember(users, memberId) {
  if (!memberId) return null;
  const match = users.find((u) => u.id === memberId || u.email === memberId);
  return match?.id || (memberId.includes("@") ? null : memberId);
}

function mutationErrorToast(action) {
  return (err) => {
    console.error(`Admin ${action} failed:`, err);
    if (err?.code === "permission-denied") {
      toast.error(
        "Permission denied — confirm Firestore users/{yourUid}.role is admin or super_admin, then refresh the app."
      );
      return;
    }
    toast.error(`Couldn't ${action}. Please try again.`);
  };
}

export default function Admin() {
  const { user: currentUser, checkUserAuth } = useAuth();
  const queryClient = useQueryClient();

  React.useEffect(() => {
    checkUserAuth?.({ silent: true }).catch((err) => {
      console.warn("Admin profile refresh failed:", err);
    });
  }, [checkUserAuth]);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.entities.User.list(),
  });

  const { data: channels = [] } = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.entities.Channel.list("-created_date", 100),
  });

  const changeRoleMutation = useMutation({
    mutationFn: (/** @type {{ user: any, role: any }} */ { user, role }) => api.entities.User.update(user.id, { role }),
    onSuccess: (_, { user, role }) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(`${[user.first_name, user.last_name].filter(Boolean).join(" ") || user.full_name || "User"} is now ${ROLE_CONFIG[role].label}`);
    },
    onError: mutationErrorToast("change role"),
  });

  const toggleMonitorMutation = useMutation({
    mutationFn: (/** @type {{ user: any }} */ { user }) =>
      api.entities.User.update(user.id, { is_monitor: !user.is_monitor }),
    onSuccess: (_, { user }) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(`${[user.first_name, user.last_name].filter(Boolean).join(" ") || user.full_name || "User"} monitoring ${user.is_monitor ? "disabled" : "enabled"}`);
    },
    onError: mutationErrorToast("update monitoring"),
  });

  const toggleChannelMutation = useMutation({
    mutationFn: (/** @type {{ user: any, channelId: any }} */ { user, channelId }) => {
      const current = user.directed_channels || [];
      const directed = current.includes(channelId)
        ? current.filter(id => id !== channelId)
        : [...current, channelId];
      return api.entities.User.update(user.id, { directed_channels: directed });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: mutationErrorToast("update channel assignment"),
  });

  const approveMutation = useMutation({
    mutationFn: async (/** @type {{ channel: any, memberId: any }} */ { channel, memberId }) => {
      const memberUid = resolvePendingMember(users, memberId);
      const members = (channel.members || []).filter(
        (entry) => entry !== memberId && entry !== memberUid
      );
      const pending = (channel.pending_members || []).filter(
        (entry) => entry !== memberId && entry !== memberUid
      );
      const memberEntry = memberUid || memberId;

      await api.entities.Channel.update(channel.id, {
        members: memberEntry ? [...members, memberEntry] : members,
        pending_members: pending,
      });

      if (memberUid) {
        await addUserChannelMembership(memberUid, channel.id);
      } else if (memberId.includes("@")) {
        console.warn(
          "Approved by email before user profile existed — profile sync runs when they sign in or via channel trigger"
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast.success("User approved");
    },
    onError: mutationErrorToast("approve user"),
  });

  const rejectMutation = useMutation({
    mutationFn: async (/** @type {{ channel: any, memberId: any }} */ { channel, memberId }) => {
      const memberUid = resolvePendingMember(users, memberId);
      const pending = (channel.pending_members || []).filter(
        (entry) => entry !== memberId && entry !== memberUid
      );
      await api.entities.Channel.update(channel.id, { pending_members: pending });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast.success("Request rejected");
    },
    onError: mutationErrorToast("reject request"),
  });

  const approveStaffAlertMutation = useMutation({
    mutationFn: (/** @type {{ user: any }} */ { user }) =>
      api.entities.User.update(user.id, {
        receives_staff_alerts: true,
        pending_staff_alerts: false,
      }),
    onSuccess: (_, { user }) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(`${[user.first_name, user.last_name].filter(Boolean).join(" ") || user.full_name || "User"} staff alerts enabled`);
    },
    onError: mutationErrorToast("approve staff alerts"),
  });

  const rejectStaffAlertMutation = useMutation({
    mutationFn: (/** @type {{ user: any }} */ { user }) =>
      api.entities.User.update(user.id, { pending_staff_alerts: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Staff alert request rejected");
    },
    onError: mutationErrorToast("reject staff alerts"),
  });

  const toggleStaffAlertsMutation = useMutation({
    mutationFn: (/** @type {{ user: any }} */ { user }) =>
      api.entities.User.update(user.id, {
        receives_staff_alerts: !user.receives_staff_alerts,
      }),
    onSuccess: (_, { user }) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(
        `${[user.first_name, user.last_name].filter(Boolean).join(" ") || user.full_name || "User"} staff alerts ${user.receives_staff_alerts ? "disabled" : "enabled"}`
      );
    },
    onError: mutationErrorToast("update staff alerts"),
  });

  if (!currentUser) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isAdmin = isPlatformAdmin(currentUser);
  const isDirector = currentUser.role === "director";
  const directedChannelIds = currentUser.directed_channels || [];

  if (!isAdmin && !isDirector) {
    return (
      <div className="min-h-screen safe-top flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <Shield className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground mb-1">Admin access required</p>
          <p className="text-xs text-muted-foreground">
            Your role is <span className="font-mono">{currentUser.role || "user"}</span>. Ask a platform admin to set your Firestore{" "}
            <span className="font-mono">users/{currentUser.id}.role</span> to{" "}
            <span className="font-mono">admin</span> or <span className="font-mono">super_admin</span>.
          </p>
        </div>
      </div>
    );
  }

  const orgUsers = isAdmin || isDirector
    ? filterUsersByOrganization(currentUser, users)
    : users;
  const orgChannels = isAdmin || isDirector
    ? filterChannelsByOrganization(currentUser, channels)
    : channels;

  const hasPendingChannelRequests = (c) => (c.pending_members || []).length > 0;

  const pendingRequests = isAdmin
    ? orgChannels.filter(hasPendingChannelRequests)
    : (directedChannelIds.length > 0
        ? channels.filter(
            (c) => directedChannelIds.includes(c.id) && hasPendingChannelRequests(c)
          )
        : filterChannelsByOrganization(currentUser, channels).filter(hasPendingChannelRequests));

  const staffAlertCandidates = isAdmin
    ? orgUsers.filter((u) => u.pending_staff_alerts === true)
    : [];

  const canManageStaffAlerts = isAdmin;

  const directors = orgUsers.filter(u => u.role === "director");
  const monitors = orgUsers.filter(u => u.role === "monitor");
  const admins = orgUsers.filter(u => u.role === "admin" || u.role === "super_admin");
  const regularUsers = orgUsers.filter(u => !u.role || u.role === "user");

  const rowProps = (u) => ({
    key: u.id,
    user: u,
    currentUser,
    channels: orgChannels,
    onChangeRole: (u, r) => changeRoleMutation.mutate({ user: u, role: r }),
    onToggleChannel: (u, cid) => toggleChannelMutation.mutate({ user: u, channelId: cid }),
    onToggleMonitor: (u) => toggleMonitorMutation.mutate({ user: u }),
    onToggleStaffAlerts: (u) => toggleStaffAlertsMutation.mutate({ user: u }),
    canManageStaffAlerts,
  });

  // Director-only view: only their channels' pending requests
  if (isDirector && !isAdmin) {
    return (
      <div className="min-h-screen safe-top">
        <div className="px-4 pt-4 pb-4 sm:px-5 sm:pt-6">
          <div className="flex items-center gap-2 mb-1">
            <Crown className="w-5 h-5 text-purple-400" />
            <h1 className="text-xl font-bold text-foreground">Channel Approvals</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Approve members for your assigned channels
          </p>
        </div>
        <DailyCodeCard organization={currentUser?.organization} />
        <PendingRequests
          channels={pendingRequests}
          users={users}
          onApprove={(ch, memberId) => approveMutation.mutate({ channel: ch, memberId })}
          onReject={(ch, memberId) => rejectMutation.mutate({ channel: ch, memberId })}
          showEmpty
        />
      </div>
    );
  }

  // Admin view: full user management
  return (
    <div className="min-h-screen safe-top">
      <div className="px-4 pt-4 pb-4 sm:px-5 sm:pt-6">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">User Management</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Assign roles, channel leads, and monitoring rights
        </p>

        {/* Role legend */}
        <div className="flex flex-wrap gap-2 mt-4">
          {Object.entries(ROLE_CONFIG).map(([role, { label, color, bg, icon: Icon }]) => (
            <div key={role} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${bg}`}>
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              <span className={`text-xs font-semibold ${color}`}>{label}</span>
              <span className="text-[10px] text-muted-foreground ml-0.5">
                {role === "admin" && "— Full control"}
                {role === "director" && "— Channel lead"}
                {role === "monitor" && "— All channels"}
                {role === "user" && "— Single channel"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <DailyCodeCard organization={currentUser?.organization} />

      <StaffAlertRequests
        users={staffAlertCandidates}
        onApprove={(u) => approveStaffAlertMutation.mutate({ user: u })}
        onReject={(u) => rejectStaffAlertMutation.mutate({ user: u })}
      />

      <PendingRequests
        channels={pendingRequests}
        users={users}
        onApprove={(ch, memberId) => approveMutation.mutate({ channel: ch, memberId })}
        onReject={(ch, memberId) => rejectMutation.mutate({ channel: ch, memberId })}
      />

      <div className="px-3 pb-24">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-1">
            {/* Directors */}
            {directors.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest px-4 mb-1">
                  Directors/Leads ({directors.length})
                </p>
                {directors.map(u => (
                  <UserRow {...rowProps(u)} />
                ))}
              </div>
            )}
            {/* Monitors */}
            {monitors.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest px-4 mb-1">
                  Monitors ({monitors.length})
                </p>
                {monitors.map(u => (
                  <UserRow {...rowProps(u)} />
                ))}
              </div>
            )}
            {/* Admins */}
            {admins.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest px-4 mb-1">
                  Admins ({admins.length})
                </p>
                {admins.map(u => (
                  <UserRow {...rowProps(u)} />
                ))}
              </div>
            )}
            {/* Regular users */}
            {regularUsers.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-4 mb-1">
                  Users ({regularUsers.length})
                </p>
                {regularUsers.map(u => (
                  <UserRow {...rowProps(u)} />
                ))}
              </div>
            )}
            {orgUsers.length === 0 && (
              <div className="text-center py-16">
                <User className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No users found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}