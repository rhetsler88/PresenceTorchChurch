import React, { useState } from "react";
import { Radio, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getDisplayName } from "@/lib/userUtils";

function MemberRow({ channel, memberId, displayName, onRemove, removing }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/20 border border-border rounded-xl mb-1.5">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: (channel.color || "#6366f1") + "20" }}
      >
        <Radio className="w-4 h-4" style={{ color: channel.color || "#6366f1" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
        <p className="text-[10px] text-muted-foreground truncate">{channel.name}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-destructive border-destructive/30 hover:bg-destructive/10 shrink-0"
        disabled={removing}
        onClick={() => onRemove({ channel, memberId, displayName })}
      >
        <UserMinus className="w-3.5 h-3.5 mr-1" />
        Remove
      </Button>
    </div>
  );
}

export default function ApprovedChannelMembers({
  channels = [],
  users = [],
  onConfirmRemove,
  removing = false,
}) {
  const [pending, setPending] = useState(null);

  const userMap = {};
  users.forEach((u) => {
    userMap[u.id] = u;
    if (u.email) userMap[u.email] = u;
  });

  const rows = channels.flatMap((channel) =>
    (channel.members || []).map((memberId) => {
      const requester = userMap[memberId];
      const displayName = requester ? getDisplayName(requester) : memberId;
      return { channel, memberId, displayName };
    })
  );

  if (rows.length === 0) return null;

  const handleConfirm = () => {
    if (!pending) return;
    onConfirmRemove?.({ channel: pending.channel, memberId: pending.memberId });
    setPending(null);
  };

  return (
    <>
      <div className="px-4 mb-4">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1 mb-2">
          Channel Members ({rows.length})
        </p>
        {rows.map(({ channel, memberId, displayName }) => (
          <MemberRow
            key={`${channel.id}-${memberId}`}
            channel={channel}
            memberId={memberId}
            displayName={displayName}
            removing={removing}
            onRemove={setPending}
          />
        ))}
      </div>

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && !removing && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending
                ? `Remove ${pending.displayName} from ${pending.channel.name}? They will lose access to this channel until approved again.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removing}
              onClick={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
            >
              {removing ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
