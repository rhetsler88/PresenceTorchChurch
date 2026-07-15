import React, { useState, useEffect } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Key, X, Copy, Check, LogOut } from "lucide-react";
import { getDailyCode, getCodeDateKey } from "@/lib/dailyCode";
import { getDailyVerse } from "@/lib/dailyVerse";
import { useAuth } from "@/lib/AuthContext";

function DailyCodeBanner() {
  const code = getDailyCode();
  const dateKey = getCodeDateKey();
  const storageKey = `daily-code-dismissed-${dateKey}`;
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(storageKey) === "true"
  );
  const [copied, setCopied] = useState(false);

  if (dismissed) return null;

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
  const [error, setError] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (code.length !== 7) return;
    setIsVerifying(true);
    try {
      if (code === getDailyCode()) {
        await api.auth.updateMe({ daily_code_verified_date: getCodeDateKey() });
        onVerified();
      } else {
        setError(true);
        setCode("");
      }
    } catch {
      setError(true);
      setCode("");
    }
    setIsVerifying(false);
  };

  const verse = getDailyVerse();

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-screen">
      <div className="w-full max-w-sm">
        {/* Social media graphic card */}
        <div className="rounded-2xl overflow-hidden shadow-lg mb-4">
          <img
            src="https://media.api.com/images/public/6a00f68db5fbaa4450ad4bfe/5ffbd3da4_64f7d905-54d9-49e3-9f7f-bf3208b90be52.jpg"
            alt="PresencePoint"
            className="w-full h-32 object-cover"
          />
        </div>

        {/* Organization card */}
        <div className="bg-card border border-border rounded-2xl p-4 mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Accessing
            </p>
            <p className="text-sm font-bold text-foreground truncate">
              {organization || "PresencePoint"}
            </p>
          </div>
        </div>

        {/* Code entry */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h1 className="text-xl font-bold text-foreground text-center mb-1">Daily Access Code</h1>
          <p className="text-sm text-muted-foreground text-center mb-5">
            Enter today's 7-digit code to continue
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={7}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ""));
                setError(false);
              }}
              className="text-center text-2xl tracking-[0.4em] font-mono h-14"
              placeholder="•••••••"
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive text-center">
                Incorrect code. Please try again.
              </p>
            )}
            <Button
              type="submit"
              className="w-full h-11"
              disabled={code.length !== 7 || isVerifying}
            >
              {isVerifying ? "Verifying..." : "Unlock"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-4">
            Contact your admin or Director/Lead for today's code
          </p>
        </div>

        <button
          onClick={() => logout(true)}
          className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Switch Account
        </button>

        {/* Daily Bible verse */}
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 mt-4 text-center">
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
      </div>
    </div>
  );
}

export default function DailyCodeGate({ user, onUserUpdate, children, showBanner = false }) {
  const todayKey = getCodeDateKey();
  const [verified, setVerified] = useState(
    user?.daily_code_verified_date === todayKey
  );

  useEffect(() => {
    if (user?.daily_code_verified_date === todayKey) {
      setVerified(true);
    }
  }, [user?.daily_code_verified_date, todayKey]);

  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const isAdminOrDirector = user.role === "admin" || user.role === "director";

  if (isAdminOrDirector) {
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
      onVerified={() => {
        setVerified(true);
        onUserUpdate?.({ ...user, daily_code_verified_date: todayKey });
      }}
    />
  );
}