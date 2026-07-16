import React from "react";
import { Badge } from "@/components/ui/badge";
import { Clock, User, Radio, FileText, MessageSquare } from "lucide-react";
import { etzTime } from "@/lib/etz";

export default function TranscriptItem({ msg, channel, senderName }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <span className="text-sm font-semibold text-foreground">
              {senderName || msg.sender_name}
            </span>
            {channel && (
              <div className="flex items-center gap-1 mt-0.5">
                <Radio className="w-2.5 h-2.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">{channel.name}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground flex-shrink-0">
          <Clock className="w-3 h-3" />
          <span className="text-[10px]">
            {msg.device_time || etzTime(msg.created_date)}
          </span>
        </div>
      </div>
      <p className="text-sm text-foreground/80 leading-relaxed pl-9 italic">
        {msg.text_content || msg.transcript || (msg.audio_url ? "Transcribing…" : "—")}
      </p>
      <div className="flex items-center gap-2 mt-2 pl-9">
        <Badge variant="secondary" className="text-[10px]">
          {msg.text_content ? (
            <>
              <MessageSquare className="w-2.5 h-2.5 mr-1" />
              text
            </>
          ) : (
            <>
              <FileText className="w-2.5 h-2.5 mr-1" />
              {msg.duration_seconds ? `${Math.round(msg.duration_seconds)}s` : "voice"}
            </>
          )}
        </Badge>
      </div>
    </div>
  );
}