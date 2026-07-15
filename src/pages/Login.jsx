import React, { useState } from "react";
import { Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";

export default function Login() {
  const { navigateToLogin } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState(null);

  const handleSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await navigateToLogin();
    } catch (err) {
      const message =
        err?.code === "auth/unauthorized-domain"
          ? "This site is not authorized for sign-in yet. Add presencetorchchurch.vercel.app to Firebase Authentication → Settings → Authorized domains."
          : err?.message || "Sign-in failed. Please try again.";
      setError(message);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background dark p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Radio className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Presence Torch</h1>
          <p className="text-sm text-muted-foreground text-center mt-2">
            Push-to-talk communication for your team
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-foreground text-center mb-1">
            Sign in to continue
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Use your Google account to access your organization's channels
          </p>

          {error && (
            <p className="text-sm text-destructive text-center mb-4">{error}</p>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={handleSignIn}
            disabled={signingIn}
          >
            {signingIn ? "Signing in..." : "Sign in with Google"}
          </Button>
        </div>
      </div>
    </div>
  );
}
