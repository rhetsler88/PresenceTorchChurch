import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Pencil, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getDisplayName,
  getProfileEmail,
  isPlatformAdmin,
  isSuperAdmin,
  filterChannelsByOrganization,
  matchesOrganization,
  getRoleLabel,
} from "@/lib/userUtils";
import {
  getChannelsFromMembershipLists,
  getChannelsFromProfile,
  getUnsyncedChannelMemberships,
} from "@/lib/channelMembership";
import { useAuth } from "@/lib/AuthContext";

const ROLES = ["user", "monitor", "lead", "director", "admin", "super_admin"];

function canDeleteUser(currentUser, targetUser) {
  if (!isPlatformAdmin(currentUser) || !targetUser) return false;
  if (currentUser.id === targetUser.id) return false;
  if (targetUser.role === "super_admin" && !isSuperAdmin(currentUser)) return false;
  return true;
}

export default function Users() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    organization: "",
    role: "user",
    onboarded: true,
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.entities.User.list(),
  });

  const { data: channels = [] } = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.entities.Channel.list("-created_date", 200),
  });

  const { data: orgs = [] } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.organizations.list(),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const updates = {
        ...form,
        full_name: [form.first_name, form.last_name].filter(Boolean).join(" "),
      };
      return api.entities.User.update(editing.id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditing(null);
      toast.success("User updated");
    },
    onError: () => toast.error("Couldn't update user"),
  });

  const deleteMutation = useMutation({
    mutationFn: (targetUserId) => api.admin.deleteUser(targetUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDeleting(null);
      if (editing?.id === deleting?.id) setEditing(null);
      toast.success("User deleted");
    },
    onError: (err) => {
      const message =
        err?.message?.includes("permission-denied") ||
        err?.code === "functions/permission-denied"
          ? "You don't have permission to delete this user"
          : "Couldn't delete user";
      toast.error(message);
    },
  });

  const syncMembershipsMutation = useMutation({
    mutationFn: () => api.admin.backfillChannelMemberships(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(
        `Synced ${result?.profilesUpdated ?? 0} profile memberships across ${result?.channels ?? 0} channels`
      );
    },
    onError: () => toast.error("Couldn't sync channel memberships"),
  });

  const backfillEmailsMutation = useMutation({
    mutationFn: () => api.admin.backfillMissingUserEmails(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(
        `Backfilled ${result?.updated ?? 0} missing email(s)${result?.unresolved ? ` · ${result.unresolved} still unresolved` : ""}`
      );
    },
    onError: () => toast.error("Couldn't backfill user emails"),
  });

  const repairAccessMutation = useMutation({
    mutationFn: (email) => api.admin.repairUserAccess(email),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast.success(
        `Repaired ${result?.email}: ${result?.channelIds?.length ?? 0} channel(s), daily code set for today`
      );
    },
    onError: (err) => {
      toast.error(err?.message || "Couldn't repair user access");
    },
  });

  const diagnoseAccessMutation = useMutation({
    mutationFn: (email) => api.admin.diagnoseUserAccess(email),
    onSuccess: (result) => {
      console.info("User access diagnosis:", result);
      const summary = result?.issues?.length
        ? result.issues.join(" · ")
        : "No obvious access issues found";
      toast.message(`Diagnosis for ${result?.email}`, {
        description: summary,
        duration: 12000,
      });
    },
    onError: (err) => {
      toast.error(err?.message || "Couldn't diagnose user access");
    },
  });

  const channelMembershipMutation = useMutation({
    mutationFn: async ({ user, channelId, assign }) => {
      const memberId = user.id || user.email;
      if (!memberId) throw new Error("User has no id or email");
      if (assign) {
        return api.admin.approveChannelMember(channelId, memberId);
      }
      return api.admin.removeChannelMember(channelId, memberId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast.success("Channel membership updated");
    },
    onError: (err) => {
      const message =
        err?.message?.includes("permission-denied") ||
        err?.code === "functions/permission-denied"
          ? "You don't have permission to manage this channel"
          : err?.message || "Couldn't update channel membership";
      toast.error(message);
    },
  });

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const name = getDisplayName(u).toLowerCase();
    return (
      name.includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      getProfileEmail(u).toLowerCase().includes(q) ||
      u.organization?.toLowerCase().includes(q)
    );
  });

  const openEdit = (user) => {
    setEditing(user);
    setForm({
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      organization: user.organization || "",
      role: user.role || "user",
      onboarded: user.onboarded ?? true,
    });
  };

  const canEditRole = isPlatformAdmin(currentUser);

  const getUserChannelInfo = (user) => {
    const approved = getChannelsFromMembershipLists(user, channels);
    const synced = getChannelsFromProfile(user, channels);
    const unsynced = getUnsyncedChannelMemberships(user, channels);
    return { approved, synced, unsynced };
  };

  const getAssignableChannels = (user) => {
    const scoped = filterChannelsByOrganization(currentUser, channels);
    if (!user?.organization) return scoped;
    return scoped.filter((ch) => matchesOrganization(user.organization, ch.organization));
  };

  const isUserOnChannel = (user, channel) => {
    const { approved } = getUserChannelInfo(user);
    return approved.some((ch) => ch.id === channel.id);
  };

  const toggleChannelMembership = (user, channelId) => {
    const channel = channels.find((ch) => ch.id === channelId);
    if (!channel) return;
    const assign = !isUserOnChannel(user, channel);
    channelMembershipMutation.mutate({ user, channelId, assign });
  };

  return (
    <div className="p-4 md:p-8 w-full max-w-5xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Users</h1>
          <p className="text-sm text-muted-foreground">
            Edit user profiles, roles, organization assignments, and channel access
          </p>
        </div>
        {isPlatformAdmin(currentUser) && (
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => backfillEmailsMutation.mutate()}
              disabled={backfillEmailsMutation.isPending}
            >
              <RefreshCw className={`w-4 h-4 ${backfillEmailsMutation.isPending ? "animate-spin" : ""}`} />
              Backfill emails
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => syncMembershipsMutation.mutate()}
              disabled={syncMembershipsMutation.isPending}
            >
              <RefreshCw className={`w-4 h-4 ${syncMembershipsMutation.isPending ? "animate-spin" : ""}`} />
              Sync channel memberships
            </Button>
          </div>
        )}
      </div>

      <div className="relative mb-6 max-w-sm w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, email, or org..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Channels</th>
                <th className="px-4 py-3 font-medium">Onboarded</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const { approved, synced, unsynced } = getUserChannelInfo(u);
                return (
                <tr key={u.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {getDisplayName(u)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {getProfileEmail(u) || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.organization || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-semibold">
                      {getRoleLabel(u.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {approved.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex flex-wrap gap-1">
                          {approved.map((ch) => (
                            <span
                              key={ch.id}
                              className="px-2 py-0.5 rounded-md bg-muted text-foreground text-xs font-medium"
                              title={
                                synced.some((s) => s.id === ch.id)
                                  ? "Synced to user profile"
                                  : "Approved on channel but not on user profile yet"
                              }
                            >
                              {ch.name}
                            </span>
                          ))}
                        </div>
                        {unsynced.length > 0 && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                            {unsynced.length} not synced to profile
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.onboarded ? "Yes" : "No"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {isPlatformAdmin(currentUser) && getProfileEmail(u) && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Diagnose access issues"
                            onClick={() => diagnoseAccessMutation.mutate(getProfileEmail(u))}
                            disabled={diagnoseAccessMutation.isPending}
                          >
                            <Search className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Repair channel membership and daily code"
                            onClick={() => repairAccessMutation.mutate(getProfileEmail(u))}
                            disabled={repairAccessMutation.isPending}
                          >
                            <RefreshCw className={`w-4 h-4 ${repairAccessMutation.isPending ? "animate-spin" : ""}`} />
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {canDeleteUser(currentUser, u) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(u)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First name</Label>
                <Input
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                />
              </div>
              <div>
                <Label>Last name</Label>
                <Input
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Organization</Label>
              <Select
                value={form.organization}
                onValueChange={(v) => setForm({ ...form, organization: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((org) => (
                    <SelectItem key={org.id} value={org.name}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v })}
                disabled={!canEditRole}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {getRoleLabel(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!canEditRole && (
                <p className="text-xs text-muted-foreground mt-1">
                  Only platform admins can change roles
                </p>
              )}
            </div>
            {editing && (
              <div>
                <Label>Channel access</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Toggle channels this user can talk on. Changes take effect immediately.
                </p>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  {(() => {
                    const assignable = getAssignableChannels(editing);
                    if (assignable.length === 0) {
                      return (
                        <p className="text-sm text-muted-foreground">No channels available</p>
                      );
                    }
                    return (
                      <div className="flex flex-wrap gap-1.5">
                        {assignable.map((ch) => {
                          const assigned = isUserOnChannel(editing, ch);
                          return (
                            <button
                              key={ch.id}
                              type="button"
                              disabled={channelMembershipMutation.isPending}
                              onClick={() => toggleChannelMembership(editing, ch.id)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${
                                assigned
                                  ? "text-white shadow-sm"
                                  : "bg-muted text-muted-foreground hover:bg-muted/70"
                              }`}
                              style={assigned ? { backgroundColor: ch.color || "#f59e0b" } : {}}
                              title={assigned ? "Click to remove" : "Click to assign"}
                            >
                              {ch.name}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                  {getUserChannelInfo(editing).unsynced.length > 0 && isPlatformAdmin(currentUser) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full mt-3"
                      onClick={() => repairAccessMutation.mutate(getProfileEmail(editing))}
                      disabled={repairAccessMutation.isPending || !getProfileEmail(editing)}
                    >
                      Repair sync for this user
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
            {canDeleteUser(currentUser, editing) && (
              <Button
                variant="destructive"
                onClick={() => setDeleting(editing)}
                disabled={saveMutation.isPending}
              >
                Delete user
              </Button>
            )}
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && !deleteMutation.isPending && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Delete {deleting ? getDisplayName(deleting) : "user"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes their account, profile, messages, and channel
              memberships. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate(deleting.id);
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete user"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
