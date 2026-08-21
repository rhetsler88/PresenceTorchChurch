import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import ReCAPTCHA from "react-google-recaptcha";

const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
const LOAD_TIMEOUT_MS = 15000;
const WIDGET_WIDTH = 304;
const WIDGET_HEIGHT = 78;

const ReCaptcha = forwardRef(function ReCaptcha({ onChange, onExpired }, ref) {
  const containerRef = useRef(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptError, setScriptError] = useState(false);
  const [scale, setScale] = useState(1);

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateScale = () => {
      const width = container.clientWidth;
      if (width > 0) {
        setScale(width / WIDGET_WIDTH);
      }
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  if (!siteKey) {
    return (
      <p className="text-sm text-destructive text-center">
        reCAPTCHA is not configured. Add VITE_RECAPTCHA_SITE_KEY to your environment.
      </p>
    );
  }

  const scaledHeight = Math.ceil(WIDGET_HEIGHT * scale);

  return (
    <div
      ref={containerRef}
      className="w-full flex flex-col justify-center gap-1"
      style={{ minHeight: scaledHeight + 8 }}
    >
      {!scriptReady && !scriptError && (
        <p className="text-sm text-muted-foreground">Loading verification...</p>
      )}
      {scriptError && (
        <p className="text-sm text-destructive text-center px-2">
          Could not load reCAPTCHA. Check your internet connection, then fully close and reopen the app.
        </p>
      )}
      <div
        className="origin-top-left overflow-hidden"
        style={{
          width: WIDGET_WIDTH,
          height: WIDGET_HEIGHT,
          transform: `scale(${scale})`,
        }}
      >
        <ReCAPTCHA
          ref={ref}
          sitekey={siteKey}
          onChange={onChange}
          onExpired={onExpired}
          asyncScriptOnLoad={handleScriptLoad}
        />
      </div>
    </div>
  );
});

export default ReCaptcha;
