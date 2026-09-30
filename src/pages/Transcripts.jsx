import React, { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "@/api/client";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import useChannels from "@/hooks/useChannels";
import { Input } from "@/components/ui/input";
import { Search, FileText, FileUp, CheckSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { etzDayKey, etzFullTimestamp, etzMediumTimestamp } from "@/lib/etz";
import { getDisplayName, getReadableVoiceChannels, isPlatformAdmin } from "@/lib/userUtils";
import {
  TRANSCRIPT_RETENTION_DAYS,
  getMessageDayKey,
  isMessageWithinRetention,
} from "@/lib/transcriptRetention";
import { needsTranscription, transcribeMessagesForExport } from "@/lib/transcription";
import { toast } from "@/lib/toast";
import DayGroup from "@/components/transcripts/DayGroup";
import { exportContentToGoogleDoc } from "@/lib/googleDocsExport";
import { chunkIds } from "@/lib/chunkIds";

const ETZ = "America/New_York";

function buildExportContent({
  messages,
  channelMap,
  resolveName,
  selectedDayLabels,
  selectedChannelLabels,
}) {
  const header = [
    `Presence Torch Transcript Log — ${etzFullTimestamp(new Date())}`,
    selectedDayLabels.length
      ? `Dates: ${selectedDayLabels.join(", ")}`
      : "Dates: (none selected)",
    selectedChannelLabels.length
      ? `Channels: ${selectedChannelLabels.join(", ")}`
      : "Channels: (none selected)",
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

function mergeTranscriptsIntoMessages(messages, transcriptsById) {
  if (!transcriptsById || Object.keys(transcriptsById).length === 0) {
    return messages;
  }
  return messages.map((m) => {
    const transcript = transcriptsById[m.id];
    if (!transcript) return m;
    return { ...m, transcript, is_transcribed: true };
  });
}

export default function Transcripts() {
  const [search, setSearch] = useState("");
  const [exportPhase, setExportPhase] = useState("idle");
  const [selectedDayKeys, setSelectedDayKeys] = useState(() => new Set());
  const [selectedChannelIds, setSelectedChannelIds] = useState(() => new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.auth.me(),
  });

  const canExport = useMemo(
    () => Boolean(user && (isPlatformAdmin(user) || user.role === "director")),
    [user]
  );

  const canDelete = useMemo(
    () => Boolean(user && isPlatformAdmin(user)),
    [user]
  );

  const handleEnterSelection = useCallback((msgId) => {
    if (!canDelete) return;
    setSelectionMode(true);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(msgId);
      return next;
    });
  }, [canDelete]);

  const handleToggleSelect = useCallback((msgId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  }, []);

  const handleCancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleEnterSelectionMode = useCallback(() => {
    if (!canDelete) return;
    setSelectionMode(true);
    setSelectedIds(new Set());
  }, [canDelete]);

  const deleteMessagesMutation = useMutation({
    mutationFn: async (/** @type {string[]} */ ids) => {
      const batches = chunkIds(ids, 100);
      let totalDeleted = 0;
      for (const batch of batches) {
        const result = await api.entities.VoiceMessage.deleteAsModerator(batch);
        totalDeleted += result?.deleted ?? batch.length;
      }
      return totalDeleted;
    },
    onSuccess: (totalDeleted) => {
      queryClient.invalidateQueries({ queryKey: ["all-messages"] });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      setSelectionMode(false);
      setSelectedIds(new Set());
      toast.success(`${totalDeleted} message${totalDeleted === 1 ? "" : "s"} deleted`);
    },
    onError: (err) => {
      console.error("Delete messages failed:", err);
      if (err?.code === "permission-denied") {
        toast.error("Permission denied — message deletion is limited to platform admins.");
        return;
      }
      toast.error("Could not delete messages. Please try again.");
    },
  });

  const { data: channels = [] } = useChannels();

  const readableChannels = useMemo(() => {
    if (!user?.id || !user?.role || !channels.length) return [];
    return getReadableVoiceChannels(user, channels);
  }, [user, channels]);

  const readableChannelIds = useMemo(
    () => readableChannels.map((c) => c.id).filter(Boolean),
    [readableChannels]
  );

  const readableChannelIdKey = readableChannelIds.join(",");

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["all-messages", user?.id, readableChannelIdKey],
    enabled: !!user?.id && !!user?.role && readableChannelIds.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const batches = await Promise.all(
        readableChannelIds.map(async (id) => {
          try {
            return await api.entities.VoiceMessage.filter({ channel_id: id }, "-created_date", 500);
          } catch (err) {
            if (err?.code === "permission-denied") return [];
            throw err;
          }
        })
      );
      const items = batches.flat();
      items.sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")));
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

  useEffect(() => {
    setSelectedChannelIds((prev) => {
      const valid = new Set(readableChannelIds);
      const next = new Set([...prev].filter((id) => valid.has(id)));
      if (next.size === 0 && readableChannelIds.length > 0) {
        return new Set(readableChannelIds);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [readableChannelIds]);

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
    const channelName = channelMap[m.channel_id]?.name?.toLowerCase() || "";
    return (
      m.transcript?.toLowerCase().includes(q)
      || m.text_content?.toLowerCase().includes(q)
      || name.toLowerCase().includes(q)
      || channelName.includes(q)
    );
  }), [messages, search, resolveName, channelMap]);

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
    if (selectedDayKeys.size === 0 || selectedChannelIds.size === 0) return [];
    return filtered.filter(
      (m) =>
        selectedDayKeys.has(getMessageDayKey(m))
        && selectedChannelIds.has(m.channel_id)
    );
  }, [filtered, selectedDayKeys, selectedChannelIds]);

  const pendingTranscriptionCount = useMemo(
    () => exportMessages.filter(needsTranscription).length,
    [exportMessages]
  );

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

  const toggleChannelSelection = useCallback((channelId) => {
    setSelectedChannelIds((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) next.delete(channelId);
      else next.add(channelId);
      return next;
    });
  }, []);

  const selectAllChannels = useCallback(() => {
    setSelectedChannelIds(new Set(readableChannelIds));
  }, [readableChannelIds]);

  const clearChannelSelection = useCallback(() => {
    setSelectedChannelIds(new Set());
  }, []);

  const handleExportToGoogleDoc = async () => {
    if (exportMessages.length === 0 || selectedDayKeys.size === 0 || selectedChannelIds.size === 0) {
      return;
    }

    setExportPhase("transcribing");
    const selectedDayLabels = [...selectedDayKeys]
      .sort((a, b) => b.localeCompare(a))
      .map((dayKey) => dayLabel(dayKey));
    const selectedChannelLabels = readableChannels
      .filter((c) => selectedChannelIds.has(c.id))
      .map((c) => c.name)
      .sort((a, b) => a.localeCompare(b));

    let messagesForExport = exportMessages;

    try {
      if (pendingTranscriptionCount > 0) {
        const transcriptsById = await transcribeMessagesForExport(exportMessages);
        messagesForExport = mergeTranscriptsIntoMessages(exportMessages, transcriptsById);
        queryClient.invalidateQueries({ queryKey: ["all-messages"] });
      }

      setExportPhase("exporting");

      const content = buildExportContent({
        messages: messagesForExport,
        channelMap,
        resolveName,
        selectedDayLabels,
        selectedChannelLabels,
      });

      const title = selectedDayLabels.length === 1
        ? `Presence Torch Transcripts — ${selectedDayLabels[0]}`
        : `Presence Torch Transcripts — ${selectedDayLabels.length} days`;

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
      setExportPhase("idle");
    }
  };

  const isExporting = exportPhase !== "idle";
  const exportButtonLabel = exportPhase === "transcribing"
    ? `Transcribing (${pendingTranscriptionCount})…`
    : exportPhase === "exporting"
      ? "Creating…"
      : "Export to Google Doc";

  return (
    <div className="min-h-full w-full">
      <div className="px-4 pb-4 border-b border-border sm:px-5 max-sm:pr-12 sm:pr-48">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between max-sm:pr-12 sm:pr-48">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground sm:text-xl">Transcript Log</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {messages.length} recordings & transcripts · last {TRANSCRIPT_RETENTION_DAYS} days
            </p>
          </div>
          {canExport && (
            <Button
              size="sm"
              onClick={handleExportToGoogleDoc}
              className="gap-1.5 shrink-0"
              disabled={exportMessages.length === 0 || isExporting}
            >
              <FileUp className="w-4 h-4" />
              <span>{exportButtonLabel}</span>
            </Button>
          )}
        </div>

        {canExport && readableChannels.length > 0 && (
          <div className="mt-4 w-full rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold text-foreground">Select channels to export</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllChannels}
                  className="text-[11px] text-primary hover:underline"
                >
                  Select all
                </button>
                <span className="text-muted-foreground/40">·</span>
                <button
                  type="button"
                  onClick={clearChannelSelection}
                  className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {readableChannels.map((channel) => {
                const selected = selectedChannelIds.has(channel.id);
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => toggleChannelSelection(channel.id)}
                    className={`rounded-full px-3 py-1 text-[11px] font-medium border transition-colors ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {channel.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {canExport && availableDayKeys.length > 0 && (
          <div className="mt-4 w-full rounded-xl border border-border bg-card p-3">
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
              {selectedDayKeys.size > 0 && selectedChannelIds.size > 0
                ? `${exportMessages.length} entries selected${
                    pendingTranscriptionCount > 0
                      ? ` · ${pendingTranscriptionCount} will be transcribed on export`
                      : ""
                  }`
                : "Choose channels and dates, then export"}
            </p>
          </div>
        )}

        <div className="relative mt-4 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search transcripts..."
            className="w-full pl-9 bg-card border-border"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {canDelete && !selectionMode && (
          <div className="flex justify-end mt-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={handleEnterSelectionMode}
            >
              <CheckSquare className="w-4 h-4" />
              Select messages
            </Button>
          </div>
        )}
      </div>

      <div className="w-full p-3 pb-36 sm:p-4">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length > 0 ? (
          <div className="flex flex-col gap-5 w-full">
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
                canDelete={canDelete}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onToggleMessageSelect={handleToggleSelect}
                onEnterSelection={handleEnterSelection}
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

      {selectionMode && (
        <div className="fixed inset-x-0 z-40 bottom-tab-bar-offset flex items-center justify-between gap-3 px-4 py-3 bg-card border-t border-border">
          <span className="text-sm font-medium text-foreground">
            {selectedIds.size} selected · tap to toggle · hold to select
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancelSelection}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => deleteMessagesMutation.mutate([...selectedIds])}
              disabled={selectedIds.size === 0 || deleteMessagesMutation.isPending}
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
