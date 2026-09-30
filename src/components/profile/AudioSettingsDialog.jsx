import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Volume2 } from "lucide-react";
import usePttSettings from "@/hooks/usePttSettings";
import {
  AUDIO_LEVEL_DEFAULT,
  AUDIO_LEVEL_MAX,
  AUDIO_LEVEL_MIN,
} from "@/lib/pttSettings";

function levelLabel(value) {
  if (value === AUDIO_LEVEL_DEFAULT) return "Default";
  if (value > AUDIO_LEVEL_DEFAULT) return `+${value - AUDIO_LEVEL_DEFAULT}%`;
  return `${value - AUDIO_LEVEL_DEFAULT}%`;
}

export default function AudioSettingsDialog({ open, onOpenChange }) {
  const { overrides, setUserListenVolume, resetUserListenVolume } = usePttSettings();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-primary" />
            How you hear others
          </DialogTitle>
          <DialogDescription>
            Adjust volume per person — only on this device. Tap the speaker icon on a voice message or tap someone&apos;s name in the online list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {overrides.length === 0 ? (
            <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border p-4">
              No custom volumes yet. Tap the speaker icon on a voice message or someone&apos;s name in the online list to adjust how you hear them.
            </p>
          ) : (
            overrides.map(({ userId, volume, displayName }) => (
              <div key={userId} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="truncate">{displayName || "Unknown speaker"}</Label>
                  <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0">
                    {levelLabel(volume)}
                  </span>
                </div>
                <Slider
                  min={AUDIO_LEVEL_MIN}
                  max={AUDIO_LEVEL_MAX}
                  step={5}
                  value={[volume]}
                  onValueChange={([value]) => setUserListenVolume(userId, value, { displayName })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => resetUserListenVolume(userId)}
                >
                  Reset to default
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
