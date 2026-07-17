import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Radio, Bell } from "lucide-react";

export default function JoinChannelDialog({
  open,
  channel,
  onOpenChange,
  onRequest,
  loading,
}) {
  if (!channel) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Join {channel.name}</DialogTitle>
          <DialogDescription>
            Choose how you want to connect to this channel.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 pt-1">
          <Button
            className="w-full justify-start gap-3 h-auto py-3"
            variant="outline"
            disabled={loading}
            onClick={() => onRequest("full")}
          >
            <Radio className="w-4 h-4 shrink-0" />
            <div className="text-left">
              <p className="font-semibold">Full access</p>
              <p className="text-xs text-muted-foreground font-normal">
                Talk and listen on PTT after admin approval
              </p>
            </div>
          </Button>
          <Button
            className="w-full justify-start gap-3 h-auto py-3"
            variant="outline"
            disabled={loading}
            onClick={() => onRequest("notifications")}
          >
            <Bell className="w-4 h-4 shrink-0" />
            <div className="text-left">
              <p className="font-semibold">Notifications only</p>
              <p className="text-xs text-muted-foreground font-normal">
                Code Red alerts for this channel — no PTT access
              </p>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
