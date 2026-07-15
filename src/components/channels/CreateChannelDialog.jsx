import React, { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Radio } from "lucide-react";
import ColorPicker from "@/components/channels/ColorPicker";
import { CHANNEL_COLORS } from "@/lib/channelColors";

export default function CreateChannelDialog({ open, onOpenChange, onCreate, userId, organization }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(CHANNEL_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onCreate({
      name: name.trim(),
      description: description.trim(),
      members: [userId],
      color,
      is_active: true,
      organization: organization || null,
    });
    setSaving(false);
    setName("");
    setDescription("");
    setColor(CHANNEL_COLORS[0]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-primary" />
            New Channel
          </DialogTitle>
          <DialogDescription>Create a push-to-talk channel.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="channelName">Channel Name</Label>
            <Input
              id="channelName"
              placeholder="e.g. Field Team Alpha"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">Description (optional)</Label>
            <Textarea
              id="desc"
              placeholder="What is this channel for?"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="h-20"
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
            <Button type="submit" disabled={saving || !name}>
              {saving ? "Creating..." : "Create Channel"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}