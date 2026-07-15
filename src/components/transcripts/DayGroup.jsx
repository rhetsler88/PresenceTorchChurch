import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import TranscriptItem from "@/components/transcripts/TranscriptItem";

export default function DayGroup({ dayKey, label, date, messages, channelMap, resolveName }) {
  const isToday = label === "Today";
  const [expanded, setExpanded] = useState(isToday);

  return (
    <div>
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="flex items-center gap-2 mb-2 px-1 w-full group"
      >
        <div className="h-px flex-1 bg-border" />
        <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2 group-hover:text-foreground transition-colors">
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {label}
          <span className="text-muted-foreground/60 normal-case tracking-normal font-medium">
            ({messages.length})
          </span>
        </span>
        <div className="h-px flex-1 bg-border" />
      </button>
      {expanded && (
        <div className="space-y-3">
          {messages.map(msg => (
            <TranscriptItem key={msg.id} msg={msg} channel={channelMap[msg.channel_id]} senderName={resolveName(msg)} />
          ))}
        </div>
      )}
    </div>
  );
}