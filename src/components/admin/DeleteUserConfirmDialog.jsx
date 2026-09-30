import React, { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDisplayName } from "@/lib/userUtils";

const CONFIRM_PHRASE = "DELETE";

export default function DeleteUserConfirmDialog({
  user,
  open,
  onOpenChange,
  onConfirm,
  isPending = false,
}) {
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (!open) setConfirmText("");
  }, [open]);

  const label = user ? getDisplayName(user) : "this user";
  const canSubmit = confirmText === CONFIRM_PHRASE && !isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Delete {label}?
          </DialogTitle>
          <DialogDescription>
            This permanently deletes their account, profile, messages, and channel memberships.
            Type <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span> to confirm.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={CONFIRM_PHRASE}
          autoComplete="off"
          disabled={isPending}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!canSubmit}
            onClick={() => onConfirm?.(user)}
          >
            {isPending ? "Deleting..." : "Delete user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
