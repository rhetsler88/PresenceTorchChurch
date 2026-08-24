import React, { useState } from "react";
import { Shield, ChevronDown, AlertTriangle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { PROTECTION_LEVELS } from "@/components/ptt/ProtectionLevelBadge";

export default function ProtectionLevelControl({
  level = "green",
  channelName = "this channel",
  onChange,
}) {
  const [pendingRed, setPendingRed] = useState(false);
  const config = PROTECTION_LEVELS[level] || PROTECTION_LEVELS.green;
  const displayName = channelName?.trim() || "this channel";

  const handleSelect = (key) => {
    if (key === "red") {
      setPendingRed(true);
      return;
    }
    onChange(key);
  };

  return (
    <>
      <div
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg border"
        style={{ backgroundColor: config.bg, borderColor: config.color + "40" }}
      >
        <Shield className="w-4 h-4 flex-shrink-0" style={{ color: config.color }} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-none">
            Protection
          </p>
          <p className="text-xs font-semibold leading-tight" style={{ color: config.color }}>
            {config.label}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 rounded hover:bg-black/10 flex-shrink-0">
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {Object.entries(PROTECTION_LEVELS).map(([key, cfg]) => (
              <DropdownMenuItem key={key} onClick={() => handleSelect(key)} className="gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                <span>{cfg.label} — {cfg.desc}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={pendingRed} onOpenChange={setPendingRed}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Set {displayName} to RED?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately change the protection level of {displayName} to Red — Danger,
              indicating an active threat or emergency on this channel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setPendingRed(false);
                onChange("red");
              }}
            >
              Confirm — Set Red
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
