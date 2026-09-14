import React, { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Headphones } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/AuthContext";
import {
  getCodeDateKey,
  isDailyCodeVerified,
  needsDailyCodeVerification,
} from "@/lib/dailyCode";
import { bypassesDailyCode } from "@/lib/userUtils";
import { hasEarpieceConnected } from "@/lib/audioOutput";
import {
  dismissEarpieceWarning,
  isEarpieceWarningDismissed,
} from "@/lib/earpieceWarning";

/**
 * Native apps only: one acknowledgment per daily code period when no headset is detected
 * after the user passes the daily access gate.
 */
export default function EarpieceWarningAfterDailyGate() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const dateKey = getCodeDateKey();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setOpen(false);
      return undefined;
    }
    if (!user?.id || !needsDailyCodeVerification(user) || bypassesDailyCode(user)) {
      setOpen(false);
      return undefined;
    }
    if (!isDailyCodeVerified(user)) {
      setOpen(false);
      return undefined;
    }
    if (isEarpieceWarningDismissed(user.id, dateKey)) {
      setOpen(false);
      return undefined;
    }

    let cancelled = false;
    void (async () => {
      const connected = await hasEarpieceConnected();
      if (cancelled) return;
      if (!connected) {
        setOpen(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    user?.id,
    user?.daily_code_verified_date,
    user?.daily_code_valid_until,
    dateKey,
  ]);

  const handleAcknowledge = () => {
    if (user?.id) {
      dismissEarpieceWarning(user.id, dateKey);
    }
    setOpen(false);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleAcknowledge();
        else setOpen(true);
      }}
    >
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Headphones className="w-5 h-5 text-primary" />
            No earpiece detected
          </AlertDialogTitle>
          <AlertDialogDescription>
            No wired earpiece or Bluetooth earbuds were detected. Connect headphones before using
            push-to-talk, or be aware that audio may play through your device speaker during
            transmissions and listening.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction className="w-full sm:w-auto" onClick={handleAcknowledge}>
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
