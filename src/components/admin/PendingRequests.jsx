import React from "react";
import { Check, X, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDisplayName } from "@/lib/userUtils";

export default function PendingRequests({ channels, users = [], onApprove, onReject, showEmpty = false }) {
  const totalPending = channels.reduce((n, c) => n + (c.pending_members || []).length, 0);
  const userMap = {};
  users.forEach(u => { userMap[u.id] = u; });

  if (totalPending === 0) {
    if (!showEmpty) return null;
    return (
      <div className="text-center py-16">
        <Radio className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No pending requests</p>
      </div>
    );
  }

  return (
    <div className="px-3 mb-4">
      <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest px-4 mb-2">
        Pending Channel Requests ({totalPending})
      </p>
      {channels.map(channel =>
        (channel.pending_members || []).map(memberId => {
          const requester = userMap[memberId];
          const displayName = requester ? getDisplayName(requester) : "Unknown User";
          const initials = displayName.slice(0, 2).toUpperCase();
          return (
            <div
              key={channel.id + memberId}
              className="flex items-center gap-3 px-4 py-3 bg-amber-500/5 border border-amber-500/20 rounded-xl mb-1.5"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: (channel.color || "#f59e0b") + "20" }}
              >
                <Radio className="w-4 h-4" style={{ color: channel.color || "#f59e0b" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                <p className="text-[10px] text-muted-foreground">wants to join {channel.name}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="w-8 h-8 text-green-500 hover:bg-green-500/10"
                onClick={() => onApprove(channel, memberId)}
              >
                <Check className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="w-8 h-8 text-destructive hover:bg-destructive/10"
                onClick={() => onReject(channel, memberId)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          );
        })
      )}
    </div>
  );
}