import React, { useState, useEffect } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Key, X, Copy, Check, LogOut } from "lucide-react";
import {
  getCodeDateKey,
  isDailyCodeVerified,
  markDailyCodeSession,
  needsDailyCodeVerification,
} from "@/lib/dailyCode";
import { normalizeOrganization, bypassesDailyCode, userHasDisplayName } from "@/lib/userUtils";
import { getDailyVerse } from "@/lib/dailyVerse";
import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import EditProfileDialog from "@/components/profile/EditProfileDialog";
import dailyCodeBanner from "@/assets/logo-daily-code.png";

function DailyCodeBanner() {
  const { data } = useQuery({
    queryKey: ["dailyAccessCode"],
    queryFn: () => api.dailyCode.getForAdmin(),
    staleTime: 60_000,
  });
  const code = data?.code;
  const dateKey = getCodeDateKey();
  const storageKey = `daily-code-dismissed-${dateKey}`;
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(storageKey) === "true"
  );
  const [copied, setCopied] = useState(false);

  if (dismissed || !code) return null;

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-primary/10 border-b border-primary/20 px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Key className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Today's Access Code
          </p>
          <p className="text-lg font-bold tracking-[0.25em] text-primary font-mono leading-tight">
            {code}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copy}>
          {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            localStorage.setItem(storageKey, "true");
            setDismissed(true);
          }}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function DailyCodeEntry({ onVerified, organization }) {
  const { logout } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);

  const hasOrganization = Boolean(normalizeOrganization(organization));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (code.length !== 7 || !hasOrganization) return;
    setIsVerifying(true);
    setError("");
    try {
      await api.dailyCode.verify(code);
      onVerified();
    } catch (err) {
      setError(err?.message || "Incorrect code. Please try again.");
      setCode("");
    }
    setIsVerifying(false);
  };

  const verse = getDailyVerse();

  return (
    <div className="page-adaptive-fill safe-bottom">
      <div className="page-adaptive-inner items-center px-4 py-6">
        <div className="w-full max-w-sm">
        <div className="rounded-2xl overflow-hidden shadow-lg mb-4">
          <img
            src={dailyCodeBanner}
            alt="Presence Torch Church — daily access"
            className="w-full h-auto object-contain"
          />
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 mb-4 text-center">
          <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2">
            Verse of the Day
          </p>
          <p className="text-base text-foreground italic leading-relaxed font-medium">
            "{verse.text}"
          </p>
          <p className="text-sm font-bold text-primary mt-3">
            — {verse.ref}
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Accessing
            </p>
            <p className="text-sm font-bold text-foreground truncate">
              {organization || "Presence Torch"}
            </p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h1 className="text-xl font-bold text-foreground text-center mb-1">Daily Access Code</h1>
          <p className="text-sm text-muted-foreground text-center mb-5">
            Enter today's 7-digit code to continue
          </p>
          {!hasOrganization && (
            <p className="text-sm text-destructive text-center mb-4">
              Your account is not assigned to an organization. Contact your administrator.
            </p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={7}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ""));
                setError("");
              }}
              className="text-center text-2xl tracking-[0.4em] font-mono h-14"
              placeholder="•••••••"
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive text-center">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="w-full h-11"
              disabled={!hasOrganization || code.length !== 7 || isVerifying}
            >
              {isVerifying ? "Verifying..." : "Unlock"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-4">
            Contact your admin or Lead for today's code
          </p>
        </div>

        <button
          type="button"
          disabled={isSwitchingAccount}
          onClick={() => {
            setIsSwitchingAccount(true);
            void logout(true);
          }}
          className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
        >
          {isSwitchingAccount ? (
            <>
              <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              Switching account...
            </>
          ) : (
            <>
              <LogOut className="w-4 h-4" />
              Switch Account
            </>
          )}
        </button>
        </div>
      </div>
    </div>
  );
}

export default function DailyCodeGate({ user, onUserUpdate, children, showBanner = false }) {
  const [verified, setVerified] = useState(() => isDailyCodeVerified(user));
  const [nameComplete, setNameComplete] = useState(() => userHasDisplayName(user));

  useEffect(() => {
    if (isDailyCodeVerified(user)) {
      setVerified(true);
    }
  }, [user?.daily_code_verified_date, user?.id]);

  useEffect(() => {
    setNameComplete(userHasDisplayName(user));
  }, [user?.first_name, user?.full_name, user?.id]);

  if (!user) {
    return null;
  }

  const needsProfileName = !userHasDisplayName(user);

  if (needsProfileName && !nameComplete) {
    return (
      <div className="flex-1 flex flex-col min-h-full bg-background">
        <EditProfileDialog
          open
          required
          nameOnly
          onOpenChange={() => {}}
          onCompleted={async () => {
            await onUserUpdate?.({ silent: true });
            setNameComplete(true);
          }}
        />
      </div>
    );
  }

  if (!needsDailyCodeVerification(user)) {
    return children;
  }

  if (bypassesDailyCode(user)) {
    return (
      <>
        {showBanner && <DailyCodeBanner />}
        {children}
      </>
    );
  }

  if (verified) return children;

  return (
    <DailyCodeEntry
      organization={user?.organization}
      onVerified={async () => {
        markDailyCodeSession();
        setVerified(true);
        await onUserUpdate?.({ silent: true });
      }}
    />
  );
}
