import React from "react";
import { cn } from "@/lib/utils";

const GOOGLE_SIGN_IN_LOGO = "/icons/google-sign-in-logo.png";
const APPLE_SIGN_IN_LOGO = "/icons/apple-sign-in-logo.png";

function OAuthButton({ label, onClick, disabled, busy, logoSrc }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex h-11 w-full items-center justify-center overflow-hidden rounded-md",
        busy
          ? "border border-[#dadce0] bg-white px-3 text-sm font-medium text-[#1f1f1f] shadow-sm"
          : "border-0 bg-transparent p-0 shadow-none",
        "transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      )}
    >
      {busy ? (
        <span className="text-xs text-[#1f1f1f]">Signing in...</span>
      ) : (
        <img
          src={logoSrc}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-contain"
          draggable={false}
        />
      )}
    </button>
  );
}

export default function OAuthSignInButtons({
  onGoogleSignIn,
  onAppleSignIn,
  disabled = false,
  activeProvider = null,
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <OAuthButton
        label="Sign in with Google"
        onClick={onGoogleSignIn}
        disabled={disabled}
        busy={activeProvider === "google"}
        logoSrc={GOOGLE_SIGN_IN_LOGO}
      />
      <OAuthButton
        label="Sign in with Apple"
        onClick={onAppleSignIn}
        disabled={disabled}
        busy={activeProvider === "apple"}
        logoSrc={APPLE_SIGN_IN_LOGO}
      />
    </div>
  );
}
