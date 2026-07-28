import React, { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "@/api/client";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Search, FileText, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { etzDayKey, etzFullTimestamp, etzMediumTimestamp } from "@/lib/etz";
import { getDisplayName, getReadableVoiceChannels, isPlatformAdmin } from "@/lib/userUtils";
import {
  TRANSCRIPT_RETENTION_DAYS,
  getMessageDayKey,
  isMessageWithinRetention,
} from "@/lib/transcriptRetention";
import { toast } from "sonner";
import DayGroup from "@/components/transcripts/DayGroup";
import { exportContentToGoogleDoc } from "@/lib/googleDocsExport";

const ETZ = "America/New_York";

function buildExportContent({ messages, channelMap, resolveName, selectedDayLabels }) {
  const header = [
    `Presence Torch Transcript Log — ${etzFullTimestamp(new Date())}`,
    selectedDayLabels.length
      ? `Dates: ${selectedDayLabels.join(", ")}`
      : "Dates: (none selected)",
    `${messages.length} entries`,
    "",
  ].join("\n");

  const body = messages.map((m) => {
    const ts = m.device_date
      ? `${m.device_date} ${m.device_time || ""}`.trim()
      : etzMediumTimestamp(m.created_date);
    const ch = channelMap[m.channel_id]?.name || "Unknown";
    return [
      `Channel: ${ch}`,
      `Timestamp: ${ts}`,
      `Sender: ${resolveName(m)}`,
      `Transcript: ${m.text_content || m.transcript || "(No transcript)"}`,
      "",
    ].join("\n");
  }).join("\n");

  return `${header}\n${body}`;
}

export default function Transcripts() {
  const [search, setSearch] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [selectedDayKeys, setSelectedDayKeys] = useState(() => new Set());
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.auth.me(),
  });

  const canExport = useMemo(
    () => Boolean(user && (isPlatformAdmin(user) || user.role === "director")),
    [user]
  );

  const { data: channels = [] } = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.entities.Channel.list("-created_date", 100),
  });

  const readableChannelIds = useMemo(() => {
    if (!user?.id || !user?.role || !channels.length) return [];
    return getReadableVoiceChannels(user, channels)
      .map((c) => c.id)
      .filter(Boolean);
  }, [user, channels]);

  const readableChannelIdKey = readableChannelIds.join(",");

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["all-messages", user?.id, readableChannelIdKey],
    enabled: !!user?.id && !!user?.role && readableChannelIds.length > 0,
    placeholderData: keepPreviousData,
    refetchInterval: 15000,
    queryFn: async () => {
      const batches = await Promise.all(
        readableChannelIds.map(async (id) => {
          try {
            return await api.entities.VoiceMessage.filter({ channel_id: id }, "-created_date", 100);
          } catch (err) {
            if (err?.code === "permission-denied") return [];
            throw err;
          }
        })
      );
      let items = batches.flat();
      items.sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")));
      items = items.slice(0, 300);
      return items.filter(
        (m) => (m.audio_url || m.text_content || m.transcript) && isMessageWithinRetention(m)
      );
    },
  });

  useEffect(() => {
    if (!user?.id || !user?.role || readableChannelIds.length === 0) return undefined;

    const unsub = api.entities.VoiceMessage.subscribeMany(
      (event) => {
        if (event.type === "create" || event.type === "update") {
          queryClient.invalidateQueries({ queryKey: ["all-messages"] });
        }
      },
      readableChannelIds.map((channelId) => ({ channel_id: channelId }))
    );

    return unsub;
  }, [user?.id, readableChannelIdKey, queryClient, readableChannelIds]);

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.entities.User.list(),
  });

  const channelMap = useMemo(() => {
    const map = {};
    channels.forEach((c) => { map[c.id] = c; });
    return map;
  }, [channels]);

  const userMap = useMemo(() => {
    const map = {};
    users.forEach((u) => { map[u.id] = u; });
    return map;
  }, [users]);

  const resolveName = useCallback((m) => {
    const sender = userMap[m.created_by_id];
    return sender ? getDisplayName(sender) : (m.sender_name || "Unknown");
  }, [userMap]);

  const filtered = useMemo(() => messages.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = resolveName(m);
    return (
      m.transcript?.toLowerCase().includes(q)
      || m.text_content?.toLowerCase().includes(q)
      || name.toLowerCase().includes(q)
    );
  }), [messages, search, resolveName]);

  const groupedByDay = useMemo(() => {
    const groups = {};
    filtered.forEach((msg) => {
      const dayKey = getMessageDayKey(msg);
      if (!dayKey) return;
      const date = new Date(msg.created_date);
      if (!groups[dayKey]) groups[dayKey] = { date, messages: [] };
      groups[dayKey].messages.push(msg);
    });
    return groups;
  }, [filtered]);

  const dayGroups = useMemo(
    () => Object.entries(groupedByDay).sort(([a], [b]) => b.localeCompare(a)),
    [groupedByDay]
  );

  const availableDayKeys = useMemo(
    () => dayGroups.map(([dayKey]) => dayKey),
    [dayGroups]
  );

  useEffect(() => {
    setSelectedDayKeys((prev) => {
      const next = new Set([...prev].filter((key) => availableDayKeys.includes(key)));
      return next.size === prev.size ? prev : next;
    });
  }, [availableDayKeys]);

  const dayLabel = useCallback((dayKey) => {
    const todayKey = etzDayKey(new Date());
    if (dayKey === todayKey) return "Today";
    const [y, m, d] = todayKey.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    const yKey = dt.toISOString().slice(0, 10);
    if (dayKey === yKey) return "Yesterday";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: ETZ,
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${dayKey}T12:00:00`));
  }, []);

  const exportMessages = useMemo(() => {
    if (selectedDayKeys.size === 0) return [];
    return filtered.filter((m) => selectedDayKeys.has(getMessageDayKey(m)));
  }, [filtered, selectedDayKeys]);

  const toggleDaySelection = useCallback((dayKey) => {
    setSelectedDayKeys((prev) => {
      const next = new Set(prev);
      if (next.has(dayKey)) next.delete(dayKey);
      else next.add(dayKey);
      return next;
    });
  }, []);

  const selectAllDays = useCallback(() => {
    setSelectedDayKeys(new Set(availableDayKeys));
  }, [availableDayKeys]);

  const clearDaySelection = useCallback(() => {
    setSelectedDayKeys(new Set());
  }, []);

  const handleExportToGoogleDoc = async () => {
    if (exportMessages.length === 0 || selectedDayKeys.size === 0) return;

    setIsExporting(true);
    const selectedDayLabels = [...selectedDayKeys]
      .sort((a, b) => b.localeCompare(a))
      .map((dayKey) => dayLabel(dayKey));

    const content = buildExportContent({
      messages: exportMessages,
      channelMap,
      resolveName,
      selectedDayLabels,
    });

    const title = selectedDayLabels.length === 1
      ? `Presence Torch Transcripts — ${selectedDayLabels[0]}`
      : `Presence Torch Transcripts — ${selectedDayLabels.length} days`;

    try {
      const result = await exportContentToGoogleDoc({ title, content });

      if (result?.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
        toast.success("Google Doc created in your Google Drive");
      } else {
        throw new Error("Missing document URL");
      }
    } catch (err) {
      console.error("Export failed:", err);
      const message = String(err?.message || "");
      if (message.includes("access_denied") || message.includes("popup_closed")) {
        toast.error("Google sign-in was cancelled");
      } else if (message.includes("origin") || message.includes("redirect_uri")) {
        toast.error("Add this site URL to Google Cloud OAuth authorized JavaScript origins");
      } else {
        toast.error(message || "Could not export to Google Doc");
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen safe-top">
      <div className="px-4 pt-4 pb-3 sm:px-5 sm:pt-6">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-bold text-foreground">Transcript Log</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {messages.length} recordings & transcripts · last {TRANSCRIPT_RETENTION_DAYS} days
            </p>
          </div>
          {canExport && (
            <Button
              size="sm"
              onClick={handleExportToGoogleDoc}
              className="gap-1.5 shrink-0 sm:mr-48 mr-12"
              disabled={exportMessages.length === 0 || isExporting}
            >
              <FileUp className="w-4 h-4" />
              <span>{isExporting ? "Creating..." : "Export to Google Doc"}</span>
            </Button>
          )}
        </div>

        {canExport && availableDayKeys.length > 0 && (
          <div className="mb-4 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold text-foreground">Select dates to export</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllDays}
                  className="text-[11px] text-primary hover:underline"
                >
                  Select all
                </button>
                <span className="text-muted-foreground/40">·</span>
                <button
                  type="button"
                  onClick={clearDaySelection}
                  className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {dayGroups.map(([dayKey]) => {
                const selected = selectedDayKeys.has(dayKey);
                return (
                  <button
                    key={dayKey}
                    type="button"
                    onClick={() => toggleDaySelection(dayKey)}
                    className={`rounded-full px-3 py-1 text-[11px] font-medium border transition-colors ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {dayLabel(dayKey)}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              {selectedDayKeys.size > 0
                ? `${exportMessages.length} entries selected`
                : "Choose one or more dates, then export"}
            </p>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search transcripts..."
            className="pl-9 bg-card border-border"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
            {dayGroups.map(([dayKey, { date, messages: dayMessages }]) => (
              <DayGroup
                key={dayKey}
                dayKey={dayKey}
                label={dayLabel(dayKey)}
                date={date}
                messages={dayMessages}
                channelMap={channelMap}
                resolveName={resolveName}
                selectable={canExport}
                selected={selectedDayKeys.has(dayKey)}
                onToggleSelect={toggleDaySelection}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No transcripts yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {search
                ? "Try a different search"
                : `Voice messages from the last ${TRANSCRIPT_RETENTION_DAYS} days appear here`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
