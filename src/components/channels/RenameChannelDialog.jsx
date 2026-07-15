import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Radio } from "lucide-react";
import ColorPicker from "@/components/channels/ColorPicker";
import { CHANNEL_COLORS } from "@/lib/channelColors";

export default function RenameChannelDialog({ open, onOpenChange, channel, onRename }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(CHANNEL_COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && channel) {
      setName(channel.name || "");
      setColor(channel.color || CHANNEL_COLORS[0]);
    }
  }, [open, channel]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !channel) return;
    setSaving(true);
    await onRename(channel.id, name.trim(), color);
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-primary" />
            Rename Channel
          </DialogTitle>
          <DialogDescription>Update the channel name.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="renameChannel">Channel Name</Label>
            <Input
              id="renameChannel"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Channel Color</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}