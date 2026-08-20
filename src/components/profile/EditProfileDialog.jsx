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
import { Switch } from "@/components/ui/switch";
import { UserCog, Fingerprint, Lock, UserX } from "lucide-react";
import { api, getAuthErrorMessage } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/lib/toast";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwordPolicy";
import {
  clearBiometricCredentials,
  getBiometricLabel,
  isBiometricHardwareAvailable,
  isBiometricPlatform,
  isBiometricSignInEnabled,
  saveBiometricCredentials,
} from "@/lib/biometricAuth";
import { auth } from "@/lib/firebase";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";

import DeleteAccountDialog from "@/components/profile/DeleteAccountDialog";

export default function EditProfileDialog({
  open,
  onOpenChange,
  required = false,
  nameOnly = false,
  onCompleted,
}) {
  const { user, checkUserAuth } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Biometric");
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [canSetPassword, setCanSetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [settingPassword, setSettingPassword] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [showBiometricSetup, setShowBiometricSetup] = useState(false);
  const [biometricPassword, setBiometricPassword] = useState("");
  const [enablingBiometric, setEnablingBiometric] = useState(false);

  useEffect(() => {
    if (!open || nameOnly || !isBiometricPlatform()) return;
    (async () => {
      const [enabled, supported, label] = await Promise.all([
        isBiometricSignInEnabled(),
        isBiometricHardwareAvailable(),
        getBiometricLabel(),
      ]);
      setBiometricEnabled(enabled);
      setBiometricSupported(supported);
      setBiometricLabel(label);
    })();
  }, [open, nameOnly]);

  useEffect(() => {
    if (!open || nameOnly) {
      setCanSetPassword(false);
      setNewPassword("");
      setConfirmPassword("");
      setShowBiometricSetup(false);
      setBiometricPassword("");
      return;
    }
    setCanSetPassword(api.auth.canSetPassword());
  }, [open, nameOnly, user]);

  useEffect(() => {
    if (open && user) {
      setFirstName(user.first_name || user.full_name?.split(" ")[0] || "");
      setLastName(user.last_name || user.full_name?.split(" ").slice(1).join(" ") || "");
    }
  }, [open, user]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!firstName.trim()) {
      toast.error("First name is required");
      return;
    }
    setSaving(true);
    try {
      await api.auth.updateMe({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      await checkUserAuth();
      toast.success("Name updated");
      onCompleted?.();
      onOpenChange(false);
    } catch (err) {
      toast.error("Couldn't update name");
    } finally {
      setSaving(false);
    }
  };

  const handleSetPassword = async () => {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setSettingPassword(true);
    try {
      await api.auth.linkPasswordForCurrentUser(newPassword);
      setCanSetPassword(false);
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password set", {
        description: "You can now sign in with email and password, or enable biometric sign-in.",
      });
    } catch (err) {
      toast.error(getAuthErrorMessage(err) || "Couldn't set password");
    } finally {
      setSettingPassword(false);
    }
  };

  const handleBiometricToggle = async (checked) => {
    if (!checked) {
      await clearBiometricCredentials();
      setBiometricEnabled(false);
      setShowBiometricSetup(false);
      setBiometricPassword("");
      toast.success(`${biometricLabel} sign-in disabled`);
      return;
    }
    if (canSetPassword) {
      toast.message(`Set a password first to enable ${biometricLabel}`, {
        description: "Biometric sign-in uses your email and password after the first email sign-in.",
      });
      return;
    }
    setShowBiometricSetup(true);
  };

  const handleEnableBiometric = async () => {
    const email = user?.email || auth.currentUser?.email;
    if (!email || !biometricPassword) {
      toast.error("Enter your password to enable biometric sign-in");
      return;
    }

    setEnablingBiometric(true);
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error("Not signed in");
      const credential = EmailAuthProvider.credential(email, biometricPassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      await saveBiometricCredentials(email, biometricPassword);
      setBiometricEnabled(true);
      setShowBiometricSetup(false);
      setBiometricPassword("");
      toast.success(`${biometricLabel} sign-in enabled`);
    } catch (err) {
      toast.error(getAuthErrorMessage(err) || "Couldn't enable biometric sign-in");
    } finally {
      setEnablingBiometric(false);
    }
  };

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (required && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-w-sm"
        hideCloseButton={required}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => {
          if (required) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (required) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="w-5 h-5 text-primary" />
            {nameOnly ? "Add your name" : "Edit Profile"}
          </DialogTitle>
          <DialogDescription>
            {nameOnly
              ? "Enter your name so others can identify you on channels."
              : "Update your display name and sign-in options."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="editFirstName">First name <span className="text-destructive">*</span></Label>
            <Input
              id="editFirstName"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="Jane"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="editLastName">Last name or initial</Label>
            <Input
              id="editLastName"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              placeholder="D or Doe"
            />
          </div>

          {canSetPassword && !nameOnly && (
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-primary" />
                <Label>Set a password</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                You signed in with Google. Add a password to sign in with email or enable {biometricLabel.toLowerCase()} sign-in.
              </p>
              <div className="space-y-2">
                <Label htmlFor="editNewPassword">New password</Label>
                <Input
                  id="editNewPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={MIN_PASSWORD_LENGTH}
                  disabled={settingPassword}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editConfirmPassword">Confirm password</Label>
                <Input
                  id="editConfirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={MIN_PASSWORD_LENGTH}
                  disabled={settingPassword}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={
                  settingPassword ||
                  newPassword.length < MIN_PASSWORD_LENGTH ||
                  confirmPassword.length < MIN_PASSWORD_LENGTH ||
                  newPassword !== confirmPassword
                }
                onClick={handleSetPassword}
              >
                {settingPassword ? "Setting password..." : "Set password"}
              </Button>
            </div>
          )}

          {biometricSupported && !nameOnly && (
            <div className="border-t border-border pt-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 text-primary" />
                  <Label htmlFor="biometric-sign-in">{biometricLabel} sign-in</Label>
                </div>
                <Switch
                  id="biometric-sign-in"
                  checked={biometricEnabled}
                  onCheckedChange={handleBiometricToggle}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Sign in quickly with {biometricLabel.toLowerCase()} using your email and password.
              </p>
              {showBiometricSetup && !biometricEnabled && (
                <div className="space-y-2 pt-2">
                  <Label htmlFor="biometricPassword">Confirm your password</Label>
                  <Input
                    id="biometricPassword"
                    type="password"
                    autoComplete="current-password"
                    value={biometricPassword}
                    onChange={(e) => setBiometricPassword(e.target.value)}
                    disabled={enablingBiometric}
                  />
                  <Button
                    type="button"
                    className="w-full"
                    disabled={enablingBiometric || !biometricPassword}
                    onClick={handleEnableBiometric}
                  >
                    {enablingBiometric ? "Enabling..." : `Enable ${biometricLabel}`}
                  </Button>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button type="submit" disabled={saving || !firstName.trim()} className="w-full">
              {saving ? "Saving..." : nameOnly ? "Continue" : "Save profile"}
            </Button>
            {!nameOnly && (
              <Button
                type="button"
                variant="ghost"
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 font-semibold"
                onClick={() => setShowDeleteAccount(true)}
              >
                <UserX className="w-4 h-4 mr-2" />
                Delete account
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <DeleteAccountDialog open={showDeleteAccount} onOpenChange={setShowDeleteAccount} />
    </>
  );
}
