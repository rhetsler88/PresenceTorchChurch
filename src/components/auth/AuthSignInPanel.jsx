import React, { useState, useEffect, useRef } from "react";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/AuthContext";
import { getAuthErrorMessage } from "@/api/client";
import ReCaptcha from "@/components/auth/ReCaptcha";
import {
  getBiometricLabel,
  hasBiometricSignIn,
  isBiometricHardwareAvailable,
  isBiometricPlatform,
  saveBiometricCredentials,
  signInWithBiometric,
} from "@/lib/biometricAuth";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwordPolicy";

export default function AuthSignInPanel({ googleButtonLabel = "Sign in with Google" }) {
  const { navigateToLogin, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const [biometricSigningIn, setBiometricSigningIn] = useState(false);
  const [error, setError] = useState(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Biometric");
  const [showBiometricSignIn, setShowBiometricSignIn] = useState(false);
  const [enableBiometricNextTime, setEnableBiometricNextTime] = useState(true);
  const [captchaToken, setCaptchaToken] = useState(null);
  const captchaRef = useRef(null);

  const resetCaptcha = () => {
    setCaptchaToken(null);
    captchaRef.current?.reset();
  };

  const isCaptchaError = (err) =>
    err?.code === "auth/recaptcha-failed" || err?.code === "auth/recaptcha-required";

  useEffect(() => {
    if (!isBiometricPlatform()) return;

    (async () => {
      const [hardware, stored, label] = await Promise.all([
        isBiometricHardwareAvailable(),
        hasBiometricSignIn(),
        getBiometricLabel(),
      ]);
      setBiometricAvailable(hardware);
      setBiometricLabel(label);
      setShowBiometricSignIn(stored);
    })();
  }, []);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!captchaToken) {
      setError('Please complete the "I\'m not a robot" check.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "sign-in") {
        await signInWithEmail(email, password, captchaToken);
        if (biometricAvailable && enableBiometricNextTime) {
          await saveBiometricCredentials(email, password);
          setShowBiometricSignIn(true);
        }
      } else {
        await signUpWithEmail(email, password, captchaToken);
      }
    } catch (err) {
      setError(getAuthErrorMessage(err));
      if (isCaptchaError(err)) {
        resetCaptcha();
      }
      setSubmitting(false);
    }
  };

  const handleBiometricSignIn = async () => {
    if (!captchaToken) {
      setError('Please complete the "I\'m not a robot" check.');
      return;
    }
    setBiometricSigningIn(true);
    setError(null);
    try {
      const { email: savedEmail, password: savedPassword } = await signInWithBiometric();
      await signInWithEmail(savedEmail, savedPassword, captchaToken);
    } catch (err) {
      if (err?.message?.includes("cancel") || err?.code === 10 || err?.code === 13) {
        setError(null);
      } else {
        setError(getAuthErrorMessage(err) || "Biometric sign-in failed.");
      }
      setBiometricSigningIn(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!captchaToken) {
      setError('Please complete the "I\'m not a robot" check.');
      return;
    }
    setGoogleSigningIn(true);
    setError(null);
    try {
      await navigateToLogin(captchaToken);
    } catch (err) {
      setError(getAuthErrorMessage(err));
      if (isCaptchaError(err)) {
        resetCaptcha();
      }
    } finally {
      setGoogleSigningIn(false);
    }
  };

  const busy = submitting || googleSigningIn || biometricSigningIn;
  const canSubmit = !busy && Boolean(captchaToken);

  return (
    <div className="relative space-y-4">
      {busy && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-background/90 backdrop-blur-sm">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">
            {googleSigningIn ? "Signing in with Google..." : "Signing in..."}
          </p>
        </div>
      )}
      {showBiometricSignIn && (
        <>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            size="lg"
            onClick={handleBiometricSignIn}
            disabled={!canSubmit}
          >
            <Fingerprint className="w-5 h-5 mr-2" />
            {biometricSigningIn ? "Signing in..." : `Sign in with ${biometricLabel}`}
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or</span>
            </div>
          </div>
        </>
      )}
      <Tabs
        value={mode}
        onValueChange={(value) => {
          setMode(value);
          setError(null);
          resetCaptcha();
        }}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sign-in">Sign in</TabsTrigger>
          <TabsTrigger value="sign-up">Create account</TabsTrigger>
        </TabsList>

        <TabsContent value="sign-in">
          <p className="text-sm text-muted-foreground text-center mb-4">
            Sign in with your email and password
          </p>
        </TabsContent>
        <TabsContent value="sign-up">
          <p className="text-sm text-muted-foreground text-center mb-4">
            Create an account with email and password
          </p>
        </TabsContent>
      </Tabs>

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      <form onSubmit={handleEmailSubmit} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="auth-email">Email</Label>
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            required
            disabled={busy}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="auth-password">Password</Label>
          <Input
            id="auth-password"
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            placeholder={mode === "sign-in" ? "Your password" : `At least ${MIN_PASSWORD_LENGTH} characters`}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            required
            minLength={mode === "sign-up" ? MIN_PASSWORD_LENGTH : undefined}
            disabled={busy}
          />
        </div>
        <ReCaptcha
          ref={captchaRef}
          onChange={setCaptchaToken}
          onExpired={resetCaptcha}
        />
        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={!canSubmit}
        >
          {submitting
            ? mode === "sign-in"
              ? "Signing in..."
              : "Creating account..."
            : mode === "sign-in"
              ? "Sign in"
              : "Create account"}
        </Button>
        {mode === "sign-in" && biometricAvailable && (
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={enableBiometricNextTime}
              onCheckedChange={(checked) => setEnableBiometricNextTime(checked === true)}
              disabled={busy}
            />
            <span className="text-sm text-muted-foreground leading-snug">
              Use {biometricLabel} for faster sign-in next time
            </span>
          </label>
        )}
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <Separator className="w-full" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">Or</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        size="lg"
        onClick={handleGoogleSignIn}
        disabled={!canSubmit}
      >
        {googleSigningIn ? "Signing in..." : googleButtonLabel}
      </Button>
    </div>
  );
}
