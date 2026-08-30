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
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { UserCog, Fingerprint, Lock, UserX, Link2, CheckCircle2 } from "lucide-react";
import { api, getAuthErrorMessage, OAUTH_PROVIDER_IDS } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/lib/toast";
import { userHasDisplayName } from "@/lib/userUtils";
import { getProviderLabel } from "@/lib/accountLinking";
import {
  clearBiometricCredentials,
  getBiometricLabel,
  isBiometricHardwareAvailable,
  isBiometricPlatform,
  isBiometricSignInEnabled,
  saveBiometricCredentials,
} from "@/lib/biometricAuth";

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
  const [linkedProviders, setLinkedProviders] = useState([]);
  const [linkingProvider, setLinkingProvider] = useState(null);
  const [linkPassword, setLinkPassword] = useState("");
  const [linkingOAuth, setLinkingOAuth] = useState(false);

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
      setLinkingProvider(null);
      setLinkPassword("");
      return;
    }
    setCanSetPassword(api.auth.canSetPassword());
    setLinkedProviders(api.auth.getLinkedProviderIds());
  }, [open, nameOnly, user]);

  useEffect(() => {
    if (open && user) {
      const storedFirst = user.first_name?.trim() || "";
      const storedFull = user.full_name?.trim() || "";
      const firstFromFull = storedFull.split(" ")[0] || "";
      const lastFromFull = storedFull.split(" ").slice(1).join(" ") || "";
      setFirstName(userHasDisplayName(user) ? (storedFirst || firstFromFull) : "");
      setLastName(user.last_name?.trim() || lastFromFull);
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
      setLinkedProviders(api.auth.getLinkedProviderIds());
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

  const handleLinkOAuthProvider = async (providerId) => {
    if (!linkPassword) {
      toast.error("Enter your password to verify your account");
      return;
    }
    setLinkingOAuth(true);
    try {
      await api.auth.linkOAuthProviderForCurrentUser(providerId, linkPassword);
      setLinkedProviders(api.auth.getLinkedProviderIds());
      setLinkingProvider(null);
      setLinkPassword("");
      toast.success(`${getProviderLabel(providerId)} sign-in linked`);
    } catch (err) {
      toast.error(getAuthErrorMessage(err) || "Couldn't link sign-in method");
    } finally {
      setLinkingOAuth(false);
    }
  };

  const handleEnableBiometric = async () => {
    const email = user?.email;
    if (!email || !biometricPassword) {
      toast.error("Enter your password to enable biometric sign-in");
      return;
    }

    setEnablingBiometric(true);
    try {
      await api.auth.verifyCurrentUserPassword(biometricPassword);
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
                You signed in with Google or Apple. Add a password to sign in with email or enable {biometricLabel.toLowerCase()} sign-in.
              </p>
              <div className="space-y-2">
                <Label htmlFor="editNewPassword">New password</Label>
                <PasswordInput
                  id="editNewPassword"
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
                <PasswordInput
                  id="editConfirmPassword"
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

          {!nameOnly && (
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-primary" />
                <Label>Sign-in methods</Label>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Email & password</span>
                  {linkedProviders.includes("password") ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Linked
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not set</span>
                  )}
                </div>
                {[OAUTH_PROVIDER_IDS.google, OAUTH_PROVIDER_IDS.apple].map((providerId) => {
                  const linked = linkedProviders.includes(providerId);
                  const canLink = api.auth.canLinkOAuthProvider(providerId);
                  const label = getProviderLabel(providerId);
                  return (
                    <div key={providerId} className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{label}</span>
                        {linked ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Linked
                          </span>
                        ) : canLink ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              setLinkingProvider(providerId);
                              setLinkPassword("");
                            }}
                          >
                            Link
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Set a password first</span>
                        )}
                      </div>
                      {linkingProvider === providerId && (
                        <div className="space-y-2 rounded-lg border border-border p-3">
                          <p className="text-xs text-muted-foreground">
                            Enter your password to verify before linking {label}.
                          </p>
                          <PasswordInput
                            autoComplete="current-password"
                            value={linkPassword}
                            onChange={(e) => setLinkPassword(e.target.value)}
                            disabled={linkingOAuth}
                          />
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              className="flex-1"
                              disabled={linkingOAuth || !linkPassword}
                              onClick={() => handleLinkOAuthProvider(providerId)}
                            >
                              {linkingOAuth ? "Linking..." : `Link ${label}`}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={linkingOAuth}
                              onClick={() => {
                                setLinkingProvider(null);
                                setLinkPassword("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
                  <PasswordInput
                    id="biometricPassword"
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
