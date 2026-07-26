import React, { forwardRef } from "react";
import ReCAPTCHA from "react-google-recaptcha";

const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

const ReCaptcha = forwardRef(function ReCaptcha({ onChange, onExpired }, ref) {
  if (!siteKey) {
    return (
      <p className="text-sm text-destructive text-center">
        reCAPTCHA is not configured. Add VITE_RECAPTCHA_SITE_KEY to your environment.
      </p>
    );
  }

  return (
    <div className="flex justify-center">
      <ReCAPTCHA
        ref={ref}
        sitekey={siteKey}
        onChange={onChange}
        onExpired={onExpired}
      />
    </div>
  );
});

export default ReCaptcha;
