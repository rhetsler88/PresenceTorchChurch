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
import { AlertTriangle, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getDisplayName,
  isPlatformAdmin,
  isSuperAdmin,
} from "@/lib/userUtils";
import { useAuth } from "@/lib/AuthContext";

const ROLES = ["user", "monitor", "director", "admin", "super_admin"];

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

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const name = getDisplayName(u).toLowerCase();
    return (
      name.includes(q) ||
      u.email?.toLowerCase().includes(q) ||
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

  return (
    <div className="p-4 md:p-8 w-full max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-1">Users</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Edit user profiles, roles, and organization assignments
      </p>

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
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Onboarded</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {getDisplayName(u)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.organization || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-semibold">
                      {u.role || "user"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.onboarded ? "Yes" : "No"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
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
              ))}
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
                      {role}
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
