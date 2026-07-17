import React, { useState, useEffect } from "react";
import { api } from "@/api/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, Clock, User, Radio, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { etzDayKey, etzFullTimestamp, etzMediumTimestamp } from "@/lib/etz";

const ETZ = 'America/New_York';
import { getDisplayName } from "@/lib/userUtils";
import { toast } from "sonner";
import DayGroup from "@/components/transcripts/DayGroup";

export default function Transcripts() {
  const [search, setSearch] = useState("");
  const [canExport, setCanExport] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    api.auth.me().then(u => setCanExport(u?.role === "admin" || u?.role === "director")).catch(() => {});
  }, []);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["all-messages"],
    queryFn: async () => {
      const items = await api.entities.VoiceMessage.list("-created_date", 300);
      return items.filter((m) => m.audio_url || m.text_content || m.transcript);
    },
  });

  useEffect(() => {
    const unsub = api.entities.VoiceMessage.subscribe((event) => {
      if (event.type === "create" || event.type === "update") {
        queryClient.invalidateQueries({ queryKey: ["all-messages"] });
      }
    });
    return unsub;
  }, [queryClient]);

  const { data: channels = [] } = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.entities.Channel.list("-created_date", 100),
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.entities.User.list(),
  });

  // Auto-delete messages older than 30 days
  useEffect(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    api.entities.VoiceMessage.deleteMany({ created_date: { $lt: cutoff.toISOString() } })
      .then(() => queryClient.invalidateQueries({ queryKey: ["all-messages"] }))
      .catch(() => {});
  }, [queryClient]);

  const channelMap = {};
  channels.forEach(c => { channelMap[c.id] = c; });

  const userMap = {};
  users.forEach(u => { userMap[u.id] = u; });

  const resolveName = (m) => {
    const user = userMap[m.created_by_id];
    return user ? getDisplayName(user) : (m.sender_name || "Unknown");
  };

  const filtered = messages.filter(m => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = resolveName(m);
    return (
      m.transcript?.toLowerCase().includes(q) ||
      m.text_content?.toLowerCase().includes(q) ||
      name.toLowerCase().includes(q)
    );
  });

  // Group by day — prefer sender's device date, fall back to ETZ of server timestamp
  const groupedByDay = {};
  filtered.forEach(msg => {
    const date = new Date(msg.created_date);
    const dayKey = msg.device_date || etzDayKey(date);
    if (!groupedByDay[dayKey]) groupedByDay[dayKey] = { date, messages: [] };
    groupedByDay[dayKey].messages.push(msg);
  });
  const dayGroups = Object.entries(groupedByDay).sort(([a], [b]) => b.localeCompare(a));

  // Label derived from the dayKey itself so it always matches the group
  const dayLabel = (dayKey) => {
    const todayKey = etzDayKey(new Date());
    if (dayKey === todayKey) return "Today";
    const [y, m, d] = todayKey.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    const yKey = dt.toISOString().slice(0, 10);
    if (dayKey === yKey) return "Yesterday";
    return new Intl.DateTimeFormat('en-US', {
      timeZone: ETZ, weekday: 'long', month: 'short', day: 'numeric', year: 'numeric'
    }).format(new Date(dayKey + 'T12:00:00'));
  };

  const handleExportToGoogleDoc = async () => {
    if (filtered.length === 0) return;
    setIsExporting(true);
    const header = `Presence Torch Transcript Log — ${etzFullTimestamp(new Date())}\n${filtered.length} entries\n\n`;
    const body = filtered.map(m => {
      const ts = m.device_date ? `${m.device_date} ${m.device_time || ""}` : etzMediumTimestamp(m.created_date);
      const ch = channelMap[m.channel_id]?.name || "Unknown";
      return `Channel: ${ch}\nTimestamp: ${ts}\nSender: ${resolveName(m)}\nTranscript: ${m.text_content || m.transcript}\n`;
    }).join("\n");
    const content = header + body;
    try {
      await navigator.clipboard.writeText(content);
      window.open("https://docs.google.com/document/create", "_blank");
      toast.success("Copied to clipboard — paste (Cmd/Ctrl+V) into the new Google Doc");
    } catch {
      toast.error("Couldn't copy to clipboard. Try the .txt export instead.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen safe-top">
      <div className="px-4 pt-4 pb-3 sm:px-5 sm:pt-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-foreground">Transcript Log</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{messages.length} recordings & transcripts</p>
          </div>
          {canExport && (
            <Button
              size="sm"
              onClick={handleExportToGoogleDoc}
              className="gap-1.5"
              disabled={filtered.length === 0 || isExporting}
            >
              <FileUp className="w-4 h-4" />
              <span className="hidden sm:inline">{isExporting ? "Preparing..." : "Export to Google Doc"}</span>
              <span className="sm:hidden">{isExporting ? "..." : "Export"}</span>
            </Button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search transcripts..."
            className="pl-9 bg-card border-border"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="px-4 pb-24">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length > 0 ? (
          <div className="space-y-5 mt-3">
            {dayGroups.map(([dayKey, { date, messages }]) => (
              <DayGroup
                key={dayKey}
                dayKey={dayKey}
                label={dayLabel(dayKey)}
                date={date}
                messages={messages}
                channelMap={channelMap}
                resolveName={resolveName}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No transcripts yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {search ? "Try a different search" : "Voice messages will be transcribed automatically"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}