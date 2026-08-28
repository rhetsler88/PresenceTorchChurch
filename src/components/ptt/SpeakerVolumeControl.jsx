import React, { useEffect, useState } from "react";
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
  PTT_SETTINGS_CHANGED,
} from "@/lib/pttSettings";

function levelLabel(value) {
  if (value === AUDIO_LEVEL_DEFAULT) return "Normal";
  if (value > AUDIO_LEVEL_DEFAULT) return `Louder (+${value - AUDIO_LEVEL_DEFAULT}%)`;
  return `Quieter (${value - AUDIO_LEVEL_DEFAULT}%)`;
}

/**
 * Per-speaker listen volume — how *you* hear this person (local device only).
 * @param {"icon" | "name"} [variant] — speaker icon (messages) or clickable name (online list)
 */
export default function SpeakerVolumeControl({
  userId,
  displayName,
  compact = false,
  variant = "icon",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [volume, setVolume] = useState(() => getUserListenVolume(userId));

  useEffect(() => {
    setVolume(getUserListenVolume(userId));
  }, [userId]);

  useEffect(() => {
    const sync = (event) => {
      if (event.detail?.userId && event.detail.userId !== userId) return;
      setVolume(getUserListenVolume(userId));
    };
    window.addEventListener(PTT_SETTINGS_CHANGED, sync);
    return () => window.removeEventListener(PTT_SETTINGS_CHANGED, sync);
  }, [userId]);

  if (!userId) return null;

  const customized = volume !== AUDIO_LEVEL_DEFAULT;
  const label = displayName || "Speaker";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setVolume(getUserListenVolume(userId));
      }}
    >
      <PopoverTrigger asChild>
        {variant === "name" ? (
          <button
            type="button"
            className={`inline-flex items-center gap-1 min-w-0 max-w-full text-left transition-colors ${
              customized
                ? "text-primary"
                : "text-foreground hover:text-primary"
            } ${className}`}
            title={`Adjust how you hear ${label}`}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-sm font-semibold truncate">{label}</span>
            <Volume2 className={`flex-shrink-0 ${customized ? "w-3.5 h-3.5" : "w-3 h-3 opacity-50"}`} />
          </button>
        ) : (
          <button
            type="button"
            className={`inline-flex items-center justify-center rounded-full transition-colors ${
              compact ? "h-7 w-7" : "h-8 w-8"
            } ${customized ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"} ${className}`}
            title={`How you hear ${label}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Volume2 className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72" align={variant === "name" ? "start" : "end"} onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground truncate">{label}</p>
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
                setUserListenVolume(userId, value, { displayName: label });
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
