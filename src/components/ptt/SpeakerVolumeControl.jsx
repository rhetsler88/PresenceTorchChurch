import React, { useState } from "react";
import { Volume2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AUDIO_LEVEL_DEFAULT,
  AUDIO_LEVEL_MAX,
  AUDIO_LEVEL_MIN,
  getUserListenVolume,
  setUserListenVolume,
  clearUserListenVolume,
} from "@/lib/pttSettings";

function levelLabel(value) {
  if (value === AUDIO_LEVEL_DEFAULT) return "Normal";
  if (value > AUDIO_LEVEL_DEFAULT) return `Louder (+${value - AUDIO_LEVEL_DEFAULT}%)`;
  return `Quieter (${value - AUDIO_LEVEL_DEFAULT}%)`;
}

/**
 * Per-speaker listen volume — how *you* hear this person (local device only).
 */
export default function SpeakerVolumeControl({
  userId,
  displayName,
  compact = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [volume, setVolume] = useState(() => getUserListenVolume(userId));

  if (!userId) return null;

  const customized = volume !== AUDIO_LEVEL_DEFAULT;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setVolume(getUserListenVolume(userId));
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center rounded-full transition-colors ${
            compact ? "h-7 w-7" : "h-8 w-8"
          } ${customized ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"} ${className}`}
          title={`How you hear ${displayName || "this speaker"}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Volume2 className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground truncate">
              {displayName || "Speaker"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Only changes how <em>you</em> hear them on this device.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`speaker-vol-${userId}`}>Volume</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{levelLabel(volume)}</span>
            </div>
            <Slider
              id={`speaker-vol-${userId}`}
              min={AUDIO_LEVEL_MIN}
              max={AUDIO_LEVEL_MAX}
              step={5}
              value={[volume]}
              onValueChange={([value]) => {
                setVolume(value);
                setUserListenVolume(userId, value, { displayName });
              }}
            />
          </div>
          {customized && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                clearUserListenVolume(userId);
                setVolume(AUDIO_LEVEL_DEFAULT);
              }}
            >
              Reset to normal
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
