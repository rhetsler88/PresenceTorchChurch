import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { auth } from "@/lib/firebase";
import { api } from "@/api/client";
import {
  dismissPasswordRotationReminder,
  getPasswordRotationMessage,
  isPasswordLoginSession,
  isPasswordRotationDismissed,
  isPasswordRotationDue,
} from "@/lib/passwordRotation";
import PasswordChangeDialog from "@/components/auth/PasswordChangeDialog";

export default function PasswordRotationReminder() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(true);
  const [changeOpen, setChangeOpen] = useState(false);

  const shouldShow = useMemo(() => {
    if (!user || !visible || isPasswordRotationDismissed()) {
      return false;
    }
    if (!isPasswordLoginSession()) {
      return false;
    }
    if (!auth.currentUser || !api.auth.hasPasswordProvider()) {
      return false;
    }
    return isPasswordRotationDue(user, auth.currentUser);
  }, [user, visible]);

  const handleDismiss = () => {
    dismissPasswordRotationReminder();
    setVisible(false);
  };

  const handlePasswordChanged = () => {
    setVisible(false);
  };

  return (
    <>
      <AnimatePresence>
        {shouldShow && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-0 left-0 right-0 z-[55] bg-amber-500 text-amber-950 shadow-lg safe-top"
          >
            <div className="flex items-start gap-3 px-4 py-3 max-w-2xl mx-auto">
              <ShieldAlert className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Password security reminder</p>
                <p className="text-xs mt-0.5 opacity-90">{getPasswordRotationMessage()}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-2 h-8 bg-amber-950/10 text-amber-950 hover:bg-amber-950/20"
                  onClick={() => setChangeOpen(true)}
                >
                  Change password
                </Button>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-amber-950 hover:bg-amber-950/10 h-8 w-8 flex-shrink-0"
                onClick={handleDismiss}
                aria-label="Dismiss password reminder"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <PasswordChangeDialog
        open={changeOpen}
        onOpenChange={setChangeOpen}
        onPasswordChanged={handlePasswordChanged}
      />
    </>
  );
}
