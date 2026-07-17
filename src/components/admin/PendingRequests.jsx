import React from "react";
import { Check, X, Radio, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDisplayName } from "@/lib/userUtils";

function PendingRow({ channel, memberId, requestType, userMap, onApprove, onReject }) {
  const requester = userMap[memberId];
  const displayName = requester ? getDisplayName(requester) : "Unknown User";
  const notificationsOnly = requestType === "notifications";

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/5 border border-amber-500/20 rounded-xl mb-1.5">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: (channel.color || "#f59e0b") + "20" }}
      >
        {notificationsOnly ? (
          <Bell className="w-4 h-4" style={{ color: channel.color || "#f59e0b" }} />
        ) : (
          <Radio className="w-4 h-4" style={{ color: channel.color || "#f59e0b" }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
        <p className="text-[10px] text-muted-foreground">
          {notificationsOnly ? "alerts only" : "full access"} — {channel.name}
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="w-8 h-8 text-green-500 hover:bg-green-500/10"
        onClick={() => onApprove(channel, memberId, requestType)}
      >
        <Check className="w-4 h-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="w-8 h-8 text-destructive hover:bg-destructive/10"
        onClick={() => onReject(channel, memberId, requestType)}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}

export default function PendingRequests({ channels, users = [], onApprove, onReject, showEmpty = false }) {
  const userMap = {};
  users.forEach((u) => {
    userMap[u.id] = u;
  });

  const pendingRows = channels.flatMap((channel) => [
    ...(channel.pending_members || []).map((memberId) => ({
      channel,
      memberId,
      requestType: "full",
    })),
    ...(channel.pending_notification_members || []).map((memberId) => ({
      channel,
      memberId,
      requestType: "notifications",
    })),
  ]);

  if (pendingRows.length === 0) {
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
        Pending Channel Requests ({pendingRows.length})
      </p>
      {pendingRows.map(({ channel, memberId, requestType }) => (
        <PendingRow
          key={channel.id + memberId + requestType}
          channel={channel}
          memberId={memberId}
          requestType={requestType}
          userMap={userMap}
          onApprove={onApprove}
          onReject={onReject}
        />
      ))}
    </div>
  );
}
