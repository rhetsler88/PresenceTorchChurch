import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { Building2, Users, Radio, Inbox, MessageSquare } from "lucide-react";

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p className="text-3xl font-bold text-foreground">{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const queriesEnabled = Boolean(user?.id);

  const { data: orgs = [] } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.organizations.list(),
    enabled: queriesEnabled,
  });
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.entities.User.list(),
    enabled: queriesEnabled,
  });
  const { data: channels = [] } = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.entities.Channel.list("-created_date", 200),
    enabled: queriesEnabled,
  });
  const { data: requests = [] } = useQuery({
    queryKey: ["accessRequests"],
    queryFn: () => api.entities.AccessRequest.list("-created_date", 200),
    enabled: queriesEnabled,
  });
  const { data: messages = [] } = useQuery({
    queryKey: ["voiceMessages"],
    queryFn: () => api.entities.VoiceMessage.list("-created_date", 500),
    enabled: queriesEnabled,
  });

  const pendingRequests = requests.filter((r) => r.status === "pending").length;
  const pendingMembers = channels.reduce(
    (sum, ch) => sum + (ch.pending_members?.length || 0),
    0
  );

  return (
    <div className="p-4 md:p-8 w-full max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-1">Dashboard</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Platform overview for Presence Torch Church
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard
          icon={Building2}
          label="Organizations"
          value={orgs.length}
          color="bg-blue-500/10 text-blue-400"
        />
        <StatCard
          icon={Users}
          label="Users"
          value={users.length}
          color="bg-purple-500/10 text-purple-400"
        />
        <StatCard
          icon={Radio}
          label="Channels"
          value={channels.length}
          color="bg-amber-500/10 text-amber-400"
        />
        <StatCard
          icon={Inbox}
          label="Pending Access Requests"
          value={pendingRequests}
          color="bg-rose-500/10 text-rose-400"
        />
        <StatCard
          icon={Users}
          label="Pending Channel Approvals"
          value={pendingMembers}
          color="bg-orange-500/10 text-orange-400"
        />
        <StatCard
          icon={MessageSquare}
          label="Voice Messages"
          value={messages.length}
          color="bg-emerald-500/10 text-emerald-400"
        />
      </div>
    </div>
  );
}
