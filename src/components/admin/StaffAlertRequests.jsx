import React from "react";
import { Check, X, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDisplayName } from "@/lib/userUtils";

function StaffAlertRow({ user, onApprove, onReject }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-destructive/5 border border-destructive/20 rounded-xl mb-1.5">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-destructive/10">
        <Bell className="w-4 h-4 text-destructive" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{getDisplayName(user)}</p>
        <p className="text-[10px] text-muted-foreground">
          Staff alerts — all channels, no PTT
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="w-8 h-8 text-green-500 hover:bg-green-500/10"
        onClick={() => onApprove(user)}
      >
        <Check className="w-4 h-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="w-8 h-8 text-destructive hover:bg-destructive/10"
        onClick={() => onReject(user)}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}

export default function StaffAlertRequests({ users = [], onApprove, onReject }) {
  const pending = users.filter((u) => u.pending_staff_alerts === true);

  if (pending.length === 0) return null;

  return (
    <div className="px-4 mb-4">
      <p className="text-[10px] font-bold text-destructive uppercase tracking-widest px-1 mb-2">
        Pending Staff Alert Requests ({pending.length})
      </p>
      {pending.map((user) => (
        <StaffAlertRow
          key={user.id}
          user={user}
          onApprove={onApprove}
          onReject={onReject}
        />
      ))}
    </div>
  );
}
