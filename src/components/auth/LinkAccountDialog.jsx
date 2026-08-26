import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Link2 } from "lucide-react";
import { api, getAuthErrorMessage } from "@/api/client";
import { getProviderLabel } from "@/lib/accountLinking";
import { toast } from "@/lib/toast";

export default function LinkAccountDialog({
  open,
  onOpenChange,
  email,
  providerId,
  pendingCredential,
  captchaToken,
  onLinked,
}) {
  const [password, setPassword] = useState("");
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setError(null);
    }
  }, [open]);

  const providerLabel = getProviderLabel(providerId);

  const handleLink = async (e) => {
    e.preventDefault();
    if (!password) {
      setError("Enter your password to verify your account.");
      return;
    }
    setLinking(true);
    setError(null);
    try {
      await api.auth.linkOAuthToExistingAccount({
        email,
        password,
        pendingCredential,
        captchaToken,
      });
      toast.success(`${providerLabel} sign-in linked`, {
        description: "You can now sign in with either method.",
      });
      onLinked?.();
      onOpenChange(false);
    } catch (err) {
      setError(getAuthErrorMessage(err) || "Couldn't link accounts.");
    } finally {
      setLinking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            Link {providerLabel} sign-in
          </DialogTitle>
          <DialogDescription>
            An account already exists for <span className="font-medium text-foreground">{email}</span>.
            Enter your password to link {providerLabel} to that account.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleLink} className="space-y-4 mt-2">
          {error && (
            <p className="text-xs text-destructive text-center">{error}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="link-account-password">Password</Label>
            <PasswordInput
              id="link-account-password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              disabled={linking}
              required
            />
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button type="submit" className="w-full" disabled={linking || !password}>
              {linking ? "Linking..." : `Verify and link ${providerLabel}`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={linking}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
