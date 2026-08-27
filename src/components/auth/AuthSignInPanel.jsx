import React, { useState, useEffect, useRef, useCallback } from "react";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/AuthContext";
import { getAuthErrorMessage, OAUTH_PROVIDER_IDS } from "@/api/client";
import ReCaptcha from "@/components/auth/ReCaptcha";
import OAuthSignInButtons from "@/components/auth/OAuthSignInButtons";
import LinkAccountDialog from "@/components/auth/LinkAccountDialog";
import { isAccountLinkRequiredError } from "@/lib/accountLinking";
import {
  getBiometricLabel,
  hasBiometricSignIn,
  isBiometricHardwareAvailable,
  isBiometricPlatform,
  saveBiometricCredentials,
  signInWithBiometric,
} from "@/lib/biometricAuth";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwordPolicy";

export default function AuthSignInPanel() {
  const { signInWithOAuth, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [oauthProvider, setOauthProvider] = useState(null);
  const [linkRequest, setLinkRequest] = useState(null);
  const [biometricSigningIn, setBiometricSigningIn] = useState(false);
  const [error, setError] = useState(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Biometric");
  const [showBiometricSignIn, setShowBiometricSignIn] = useState(false);
  const [enableBiometricNextTime, setEnableBiometricNextTime] = useState(true);
  const [captchaToken, setCaptchaToken] = useState(null);
  const captchaRef = useRef(null);
  const autoBiometricAttemptedRef = useRef(false);

  const resetCaptcha = () => {
    setCaptchaToken(null);
    captchaRef.current?.reset();
  };

  const isCaptchaError = (err) =>
    err?.code === "auth/recaptcha-failed" || err?.code === "auth/recaptcha-required";

  const isBiometricCancelled = (err) =>
    err?.message?.includes("cancel") || err?.code === 10 || err?.code === 13;

  const promptBiometricSignIn = useCallback(async () => {
    setBiometricSigningIn(true);
    setError(null);
    try {
      const { email: savedEmail, password: savedPassword } = await signInWithBiometric();
      await signInWithEmail(savedEmail, savedPassword);
    } catch (err) {
      if (isBiometricCancelled(err)) {
        setError(null);
      } else {
        setError(getAuthErrorMessage(err) || "Biometric sign-in failed.");
      }
    } finally {
      setBiometricSigningIn(false);
    }
  }, [signInWithEmail]);

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

  useEffect(() => {
    if (
      !showBiometricSignIn ||
      mode !== "sign-in" ||
      autoBiometricAttemptedRef.current
    ) {
      return;
    }

    autoBiometricAttemptedRef.current = true;
    void promptBiometricSignIn();
  }, [showBiometricSignIn, mode, promptBiometricSignIn]);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (mode === "sign-up" && !captchaToken) {
      setError('Please complete the "I\'m not a robot" check.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "sign-in") {
        await signInWithEmail(email, password);
        if (biometricAvailable && enableBiometricNextTime) {
          await saveBiometricCredentials(email, password);
          setShowBiometricSignIn(true);
        }
      } else {
        await signUpWithEmail(email, password, captchaToken);
      }
    } catch (err) {
      setError(getAuthErrorMessage(err));
      if (mode === "sign-up" && isCaptchaError(err)) {
        resetCaptcha();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleOAuthSignIn = async (providerKey) => {
    setOauthProvider(providerKey);
    setError(null);
    try {
      const providerId =
        providerKey === "apple" ? OAUTH_PROVIDER_IDS.apple : OAUTH_PROVIDER_IDS.google;
      await signInWithOAuth(providerId);
    } catch (err) {
      if (isAccountLinkRequiredError(err)) {
        setLinkRequest({
          email: err.email,
          providerId: err.providerId,
          pendingCredential: err.pendingCredential,
        });
        setError(null);
        return;
      }
      setError(getAuthErrorMessage(err));
    } finally {
      setOauthProvider(null);
    }
  };

  const busy = submitting || Boolean(oauthProvider) || biometricSigningIn;
  const requiresCaptcha = mode === "sign-up";
  const canSubmitEmail = !busy && (!requiresCaptcha || Boolean(captchaToken));

  return (
    <>
    <div className="relative space-y-2.5">
      {busy && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl bg-background/90 backdrop-blur-sm">
          <div className="w-7 h-7 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground font-medium">
            {oauthProvider === "google"
              ? "Signing in with Google..."
              : oauthProvider === "apple"
                ? "Signing in with Apple..."
                : "Signing in..."}
          </p>
        </div>
      )}
      <Tabs
        value={mode}
        onValueChange={(value) => {
          setMode(value);
          setError(null);
          if (value === "sign-in") {
            resetCaptcha();
          }
        }}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 h-9">
          <TabsTrigger value="sign-in" className="text-sm">Sign in</TabsTrigger>
          <TabsTrigger value="sign-up" className="text-sm">Create account</TabsTrigger>
        </TabsList>

        <TabsContent value="sign-in" className="mt-2">
          <p className="text-xs text-muted-foreground text-center">
            Sign in with your email and password
          </p>
        </TabsContent>
        <TabsContent value="sign-up" className="mt-2">
          <p className="text-xs text-muted-foreground text-center">
            Create an account with email and password
          </p>
        </TabsContent>
      </Tabs>

      {error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}

      <form onSubmit={handleEmailSubmit} className="space-y-2">
        <div className="space-y-1">
          <Label htmlFor="auth-email" className="text-sm">Email</Label>
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
            className="h-10"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="auth-password" className="text-sm">Password</Label>
          <PasswordInput
            id="auth-password"
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
            className="h-10"
          />
        </div>
        {requiresCaptcha && (
          <ReCaptcha
            ref={captchaRef}
            onChange={setCaptchaToken}
            onExpired={resetCaptcha}
          />
        )}
        <Button
          type="submit"
          className="w-full h-10"
          disabled={!canSubmitEmail}
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
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox
              checked={enableBiometricNextTime}
              onCheckedChange={(checked) => setEnableBiometricNextTime(checked === true)}
              disabled={busy}
            />
            <span className="text-xs text-muted-foreground leading-snug">
              Use {biometricLabel} for faster sign-in next time
            </span>
          </label>
        )}
      </form>

      <div className="relative py-0.5">
        <div className="absolute inset-0 flex items-center">
          <Separator className="w-full" />
        </div>
        <div className="relative flex justify-center text-[10px] uppercase">
          <span className="bg-card px-2 text-muted-foreground">Or</span>
        </div>
      </div>

      <OAuthSignInButtons
        onGoogleSignIn={() => handleOAuthSignIn("google")}
        onAppleSignIn={() => handleOAuthSignIn("apple")}
        disabled={busy}
        activeProvider={oauthProvider}
      />

      {showBiometricSignIn && (
        <>
          <div className="relative py-0.5">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or</span>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="w-full h-10"
            onClick={() => void promptBiometricSignIn()}
            disabled={busy}
          >
            <Fingerprint className="w-4 h-4 mr-2" />
            {biometricSigningIn ? "Signing in..." : `Sign in with ${biometricLabel}`}
          </Button>
        </>
      )}
    </div>
    <LinkAccountDialog
      open={Boolean(linkRequest)}
      onOpenChange={(open) => {
        if (!open) setLinkRequest(null);
      }}
      email={linkRequest?.email || ""}
      providerId={linkRequest?.providerId}
      pendingCredential={linkRequest?.pendingCredential}
      onLinked={() => {
        setLinkRequest(null);
        setError(null);
      }}
    />
  </>
  );
}
