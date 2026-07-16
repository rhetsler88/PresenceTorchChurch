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
import { UserCog, Fingerprint } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { useBluetoothPTTContext } from "@/components/ptt/BluetoothPTTContext";
import BluetoothPTTControl from "@/components/ptt/BluetoothPTTControl";
import {
  clearBiometricCredentials,
  getBiometricLabel,
  isBiometricHardwareAvailable,
  isBiometricPlatform,
  isBiometricSignInEnabled,
} from "@/lib/biometricAuth";

export default function EditProfileDialog({ open, onOpenChange }) {
  const { user, checkUserAuth } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Biometric");
  const [biometricSupported, setBiometricSupported] = useState(false);
  const bluetooth = useBluetoothPTTContext();

  useEffect(() => {
    if (!open || !isBiometricPlatform()) return;
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
  }, [open]);

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
      onOpenChange(false);
    } catch (err) {
      toast.error("Couldn't update name");
    } finally {
      setSaving(false);
    }
  };

  const handleBiometricToggle = async (checked) => {
    if (!checked) {
      await clearBiometricCredentials();
      setBiometricEnabled(false);
      toast.success(`${biometricLabel} sign-in disabled`);
      return;
    }
    toast.message(`Sign out and sign in with email to enable ${biometricLabel}`, {
      description: 'Check "Use biometrics for faster sign-in" on the sign-in screen.',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="w-5 h-5 text-primary" />
            Edit Profile
          </DialogTitle>
          <DialogDescription>Update your display name.</DialogDescription>
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
          {biometricSupported && (
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
                Sign in quickly with {biometricLabel.toLowerCase()} after your first email sign-in.
              </p>
            </div>
          )}
          {bluetooth?.isSupported && (
            <div className="border-t border-border pt-4 space-y-2">
              <Label>Bluetooth Button</Label>
              <BluetoothPTTControl
                isSupported={bluetooth.isSupported}
                isConnected={bluetooth.isConnected}
                isConnecting={bluetooth.isConnecting}
                deviceName={bluetooth.deviceName}
                onConnect={bluetooth.connect}
                onDisconnect={bluetooth.disconnect}
              />
              <p className="text-xs text-muted-foreground">
                Pair a Bluetooth push-to-talk button for hands-free use.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={saving || !firstName.trim()} className="w-full">
              {saving ? "Saving..." : "Save name"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}