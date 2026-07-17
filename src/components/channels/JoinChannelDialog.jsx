import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Radio } from "lucide-react";

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
          <DialogTitle>Request access to {channel.name}</DialogTitle>
          <DialogDescription>
            An admin will review your request. Once approved, you can talk and listen on this channel.
          </DialogDescription>
        </DialogHeader>
        <Button
          className="w-full justify-start gap-3 h-auto py-3 mt-1"
          disabled={loading}
          onClick={() => onRequest()}
        >
          <Radio className="w-4 h-4 shrink-0" />
          <div className="text-left">
            <p className="font-semibold">Request full access</p>
            <p className="text-xs text-primary-foreground/80 font-normal">
              Talk and listen on PTT
            </p>
          </div>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
