import React, { forwardRef, useCallback, useEffect, useState } from "react";
import ReCAPTCHA from "react-google-recaptcha";

const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
const LOAD_TIMEOUT_MS = 15000;

const ReCaptcha = forwardRef(function ReCaptcha({ onChange, onExpired, compact = false }, ref) {
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptError, setScriptError] = useState(false);

  const handleScriptLoad = useCallback(() => {
    setScriptReady(true);
    setScriptError(false);
  }, []);

  useEffect(() => {
    if (!siteKey || scriptReady || scriptError) return undefined;

    const timeoutId = window.setTimeout(() => {
      setScriptError(true);
    }, LOAD_TIMEOUT_MS);

    return () => window.clearTimeout(timeoutId);
  }, [scriptReady, scriptError]);

  if (!siteKey) {
    return (
      <p className="text-sm text-destructive text-center">
        reCAPTCHA is not configured. Add VITE_RECAPTCHA_SITE_KEY to your environment.
      </p>
    );
  }

  return (
    <div className={`w-full flex flex-col items-center justify-center gap-1 ${compact ? "min-h-[68px]" : "min-h-[84px] py-1"}`}>
      {!scriptReady && !scriptError && (
        <p className="text-sm text-muted-foreground">Loading verification...</p>
      )}
      {scriptError && (
        <p className="text-sm text-destructive text-center px-2">
          Could not load reCAPTCHA. Check your internet connection, then fully close and reopen the app.
        </p>
      )}
      <ReCAPTCHA
        ref={ref}
        sitekey={siteKey}
        size={compact ? "compact" : "normal"}
        onChange={onChange}
        onExpired={onExpired}
        asyncScriptOnLoad={handleScriptLoad}
      />
    </div>
  );
});

export default ReCaptcha;
