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
import { Plus, Pencil, Trash2, Radio } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { useBootstrapDatabase } from "@admin/hooks/useBootstrapDatabase";

const COLORS = ["#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899", "#10b981", "#ef4444"];
const PROTECTION_LEVELS = ["blue", "green", "yellow", "red"];

export default function Channels() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { needsSeed, canInitialize, seedMutation } = useBootstrapDatabase(user);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: "",
    organization: "",
    color: "#f59e0b",
    protection_level: "green",
    description: "",
  });

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.entities.Channel.list("-created_date", 200),
  });

  const { data: orgs = [] } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.organizations.list(),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        members: editing?.members || [],
        pending_members: editing?.pending_members || [],
        is_active: true,
      };
      if (editing) {
        return api.entities.Channel.update(editing.id, payload);
      }
      return api.entities.Channel.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      setDialogOpen(false);
      setEditing(null);
      toast.success(editing ? "Channel updated" : "Channel created");
    },
    onError: () => toast.error("Couldn't save channel"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Channel.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast.success("Channel deleted");
    },
    onError: () => toast.error("Couldn't delete channel"),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "",
      organization: orgs[0]?.name || "",
      color: "#f59e0b",
      protection_level: "green",
      description: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (channel) => {
    setEditing(channel);
    setForm({
      name: channel.name || "",
      organization: channel.organization || "",
      color: channel.color || "#f59e0b",
      protection_level: channel.protection_level || "green",
      description: channel.description || "",
    });
    setDialogOpen(true);
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Channels</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage PTT channels across organizations
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Add channel
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : channels.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <Radio className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No channels yet</p>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            {needsSeed
              ? "Initialize the default Safety Team and PH Kids channels, or add a channel manually."
              : "Add your first channel to get started."}
          </p>
          {canInitialize && needsSeed ? (
            <Button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="gap-2"
            >
              {seedMutation.isPending ? "Initializing..." : "Initialize default channels"}
            </Button>
          ) : (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" />
              Add channel
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {channels.map((ch) => (
            <div
              key={ch.id}
              className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold"
                  style={{ backgroundColor: (ch.color || "#f59e0b") + "20", color: ch.color }}
                >
                  {ch.name?.[0]}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{ch.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ch.organization} · {ch.members?.length || 0} members ·{" "}
                    {ch.pending_members?.length || 0} pending
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(ch)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => {
                    if (confirm(`Delete channel "${ch.name}"?`)) {
                      deleteMutation.mutate(ch.id);
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit channel" : "Add channel"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Safety Team"
              />
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
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Color</Label>
                <Select
                  value={form.color}
                  onValueChange={(v) => setForm({ ...form, color: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLORS.map((c) => (
                      <SelectItem key={c} value={c}>
                        <span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: c }} />
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Protection level</Label>
                <Select
                  value={form.protection_level}
                  onValueChange={(v) => setForm({ ...form, protection_level: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROTECTION_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!form.name.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
