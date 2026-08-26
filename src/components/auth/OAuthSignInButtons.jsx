import React from "react";
import { cn } from "@/lib/utils";

function GoogleMark({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function AppleMark({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M16.365 1.43c0 1.14-.467 2.226-1.227 3.032-.764.806-2.015 1.375-3.138 1.28-.145-1.09.48-2.246 1.227-3.032.764-.84 2.088-1.448 3.138-1.28zm4.32 16.824c-.735 1.635-1.075 2.37-2.01 3.82-1.304 1.902-3.145 4.275-5.43 4.295-2.028.02-2.548-1.32-4.73-1.32-2.18 0-2.72 1.3-4.74 1.28-2.285-.02-4.02-2.33-5.325-4.23-3.655-5.33-4.04-11.59-1.78-14.9 1.615-2.33 4.175-3.69 6.57-3.69 2.44 0 3.975 1.32 5.99 1.32 1.96 0 3.155-1.32 5.97-1.32 2.145 0 4.405 1.17 6.02 3.19-5.29 2.88-4.43 10.38.87 12.56-.51 1.36-1.05 2.64-1.445 3.57z"
      />
    </svg>
  );
}

function OAuthButton({ label, onClick, disabled, busy, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex h-11 w-full items-center justify-center rounded-md border border-[#dadce0] bg-white px-3",
        "text-sm font-medium text-[#1f1f1f] shadow-sm transition-colors",
        "hover:bg-[#f8f9fa] disabled:cursor-not-allowed disabled:opacity-60"
      )}
    >
      {busy ? (
        <span className="text-xs text-[#1f1f1f]">Signing in...</span>
      ) : (
        children
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
      >
        <GoogleMark className="h-5 w-5" />
      </OAuthButton>
      <OAuthButton
        label="Sign in with Apple"
        onClick={onAppleSignIn}
        disabled={disabled}
        busy={activeProvider === "apple"}
      >
        <AppleMark className="h-5 w-5 text-black" />
      </OAuthButton>
    </div>
  );
}
