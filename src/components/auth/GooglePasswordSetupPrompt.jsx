import React, { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/AuthContext";
import { api } from "@/api/client";
import EditProfileDialog from "@/components/profile/EditProfileDialog";

const DISMISS_KEY_PREFIX = "google_password_setup_dismissed_";

function isDismissed(userId) {
  if (!userId || typeof localStorage === "undefined") return true;
  return localStorage.getItem(`${DISMISS_KEY_PREFIX}${userId}`) === "1";
}

function dismiss(userId) {
  if (!userId || typeof localStorage === "undefined") return;
  localStorage.setItem(`${DISMISS_KEY_PREFIX}${userId}`, "1");
}

export default function GooglePasswordSetupPrompt() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (!user?.id || isDismissed(user.id)) {
      setOpen(false);
      return;
    }
    setOpen(api.auth.canSetPassword());
  }, [user?.id, user?.password_updated_at]);

  const handleLater = () => {
    if (user?.id) dismiss(user.id);
    setOpen(false);
  };

  const handleSetup = () => {
    setOpen(false);
    setEditOpen(true);
  };

  const handleEditClose = (nextOpen) => {
    setEditOpen(nextOpen);
    if (!nextOpen && user?.id && !api.auth.canSetPassword()) {
      dismiss(user.id);
    }
  };

  return (
    <>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              Set a password
            </AlertDialogTitle>
            <AlertDialogDescription>
              You signed in with Google or Apple. Add a password so you can sign in with email and enable
              biometric sign-in on this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction className="w-full" onClick={handleSetup}>
              Set up now
            </AlertDialogAction>
            <AlertDialogCancel className="w-full" onClick={handleLater}>
              Maybe later
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <EditProfileDialog open={editOpen} onOpenChange={handleEditClose} />
    </>
  );
}
