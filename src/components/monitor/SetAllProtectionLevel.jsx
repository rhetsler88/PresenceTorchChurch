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

export default function SetAllProtectionLevel({ onApply }) {
  const [pendingRed, setPendingRed] = useState(false);

  const handleSelect = (key) => {
    if (key === "red") {
      setPendingRed(true);
      return;
    }
    onApply(key);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 px-5 py-3 rounded-xl border border-border bg-card text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors">
            <Shield className="w-5 h-5 text-primary" />
            Set All Channels
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          {Object.entries(PROTECTION_LEVELS).map(([key, cfg]) => (
            <DropdownMenuItem key={key} onClick={() => handleSelect(key)} className="gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cfg.color }} />
              <span>{cfg.label} — {cfg.desc}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={pendingRed} onOpenChange={setPendingRed}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Set all channels to RED?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately change the protection level of all channels to Red — Danger, indicating an active threat or emergency across every channel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 text-white hover:bg-red-600"
              onClick={() => {
                setPendingRed(false);
                onApply("red");
              }}
            >
              Confirm — Set All Red
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}