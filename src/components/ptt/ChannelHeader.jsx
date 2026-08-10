import React, { useState } from "react";
import { Radio, Users } from "lucide-react";
import ChannelMembersSheet from "@/components/channels/ChannelMembersSheet";

export default function ChannelHeader({ channel, memberCount, isConnected }) {
  const [showMembers, setShowMembers] = useState(false);

  return (
    <>
      <div className="bg-background flex items-center pl-5 py-3 pr-[calc(5rem+env(safe-area-inset-right,0px))] sm:pr-48">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: (channel?.color || "#f59e0b") + "20" }}
          >
            <Radio className="w-5 h-5" style={{ color: channel?.color || "#f59e0b" }} />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-foreground leading-tight truncate">
              {channel?.name || "No Channel"}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-500" : "bg-muted-foreground"}`} />
              <span className="text-xs text-muted-foreground">
                {isConnected ? "Connected" : "Disconnected"}
              </span>
              <span className="text-muted-foreground">·</span>
              <button
                onClick={() => setShowMembers(true)}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground active:scale-95 transition-all"
              >
                <Users className="w-3 h-3" />
                <span className="text-xs">{memberCount}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      <ChannelMembersSheet channel={channel} open={showMembers} onOpenChange={setShowMembers} />
    </>
  );
}