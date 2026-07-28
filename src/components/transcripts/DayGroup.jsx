import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import TranscriptItem from "@/components/transcripts/TranscriptItem";

export default function DayGroup({
  dayKey,
  label,
  date,
  messages,
  channelMap,
  resolveName,
  selectable = false,
  selected = false,
  onToggleSelect,
}) {
  const isToday = label === "Today";
  const [expanded, setExpanded] = useState(isToday);

  const handleHeaderClick = () => {
    if (selectable) {
      onToggleSelect?.(dayKey);
      return;
    }
    setExpanded((prev) => !prev);
  };

  const handleExpandClick = (event) => {
    event.stopPropagation();
    setExpanded((prev) => !prev);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1 w-full group">
        {selectable && (
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect?.(dayKey)}
            aria-label={`Select ${label} for export`}
          />
        )}
        <button
          type="button"
          onClick={handleHeaderClick}
          className="flex items-center gap-2 flex-1 min-w-0 group"
        >
          <div className="h-px flex-1 bg-border" />
          <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 transition-colors ${
            selectable && selected ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
          }`}>
            {!selectable && (expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
            {label}
            <span className="text-muted-foreground/60 normal-case tracking-normal font-medium">
              ({messages.length})
            </span>
          </span>
          <div className="h-px flex-1 bg-border" />
        </button>
        {selectable && (
          <button
            type="button"
            onClick={handleExpandClick}
            className="p-1 text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "Collapse day" : "Expand day"}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        )}
      </div>
      {expanded && (
        <div className="space-y-3">
          {messages.map((msg) => (
            <TranscriptItem
              key={msg.id}
              msg={msg}
              channel={channelMap[msg.channel_id]}
              senderName={resolveName(msg)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
