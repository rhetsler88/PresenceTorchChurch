import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/AuthContext";
import { formatAuthError } from "@/api/client";
import AppLogo from "@/components/branding/AppLogo";

const MODES = {
  signin: "signin",
  register: "register",
  reset: "reset",
};

export default function Login() {
  const { navigateToLogin, signInWithEmail, registerWithEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState(MODES.signin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const switchMode = (next) => {
    setMode(next);
    setError(null);
    setInfo(null);
    setPassword("");
    setConfirmPassword("");
  };

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await navigateToLogin();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your email address.");
      return;
    }

    if (mode === MODES.reset) {
      setBusy(true);
      try {
        await resetPassword(trimmedEmail);
        setInfo("Password reset email sent. Check your inbox.");
      } catch (err) {
        setError(formatAuthError(err));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!password) {
      setError("Enter your password.");
      return;
    }

    if (mode === MODES.register) {
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
      setBusy(true);
      try {
        await registerWithEmail({
          email: trimmedEmail,
          password,
          firstName,
          lastName,
        });
      } catch (err) {
        setError(formatAuthError(err));
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      await signInWithEmail(trimmedEmail, password);
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === MODES.register
      ? "Create your account"
      : mode === MODES.reset
        ? "Reset your password"
        : "Sign in to continue";

  const subtitle =
    mode === MODES.register
      ? "Register with email and password, or continue with Google"
      : mode === MODES.reset
        ? "We'll email you a link to choose a new password"
        : "Use your email and password, or continue with Google";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background dark p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <AppLogo className="w-20 h-20 mb-4" />
          <h1 className="text-2xl font-bold text-foreground">Presence Torch</h1>
          <p className="text-sm text-muted-foreground text-center mt-2">
            Push-to-talk communication for your team
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-foreground text-center mb-1">{title}</h2>
          <p className="text-sm text-muted-foreground text-center mb-6">{subtitle}</p>

          {error && (
            <p className="text-sm text-destructive text-center mb-4">{error}</p>
          )}
          {info && (
            <p className="text-sm text-primary text-center mb-4">{info}</p>
          )}

          <form onSubmit={handleEmailSubmit} className="space-y-3">
            {mode === MODES.register && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={busy}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={busy}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                required
              />
            </div>

            {mode !== MODES.reset && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="password">Password</Label>
                  {mode === MODES.signin && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => switchMode(MODES.reset)}
                      disabled={busy}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === MODES.register ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  required
                  minLength={mode === MODES.register ? 6 : undefined}
                />
              </div>
            )}

            {mode === MODES.register && (
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={busy}
                  required
                  minLength={6}
                />
              </div>
            )}

            <Button className="w-full" size="lg" type="submit" disabled={busy}>
              {busy
                ? mode === MODES.register
                  ? "Creating account..."
                  : mode === MODES.reset
                    ? "Sending..."
                    : "Signing in..."
                : mode === MODES.register
                  ? "Create account"
                  : mode === MODES.reset
                    ? "Send reset link"
                    : "Sign in"}
            </Button>
          </form>

          {mode !== MODES.reset && (
            <>
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                variant="outline"
                type="button"
                onClick={handleGoogleSignIn}
                disabled={busy}
              >
                {busy ? "Please wait..." : "Continue with Google"}
              </Button>
            </>
          )}

          <div className="mt-5 text-center text-sm text-muted-foreground">
            {mode === MODES.signin && (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  className="font-medium text-foreground hover:underline"
                  onClick={() => switchMode(MODES.register)}
                  disabled={busy}
                >
                  Register
                </button>
              </>
            )}
            {mode === MODES.register && (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="font-medium text-foreground hover:underline"
                  onClick={() => switchMode(MODES.signin)}
                  disabled={busy}
                >
                  Sign in
                </button>
              </>
            )}
            {mode === MODES.reset && (
              <button
                type="button"
                className="font-medium text-foreground hover:underline"
                onClick={() => switchMode(MODES.signin)}
                disabled={busy}
              >
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
