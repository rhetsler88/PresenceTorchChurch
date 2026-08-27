import React from "react";

const GOOGLE_SIGN_IN_MARK = "/icons/google-sign-in-mark.png";
const APPLE_SIGN_IN_MARK = "/icons/apple-sign-in-mark.png";

const BUTTON_BASE =
  "flex h-11 w-full min-w-0 items-center justify-center gap-2 rounded-md border border-[#dadce0] bg-white px-3 transition-colors hover:bg-[#f8f9fa] disabled:cursor-not-allowed disabled:opacity-60";

function OAuthButton({ label, text, onClick, disabled, busy, logo }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={BUTTON_BASE}
    >
      {busy ? (
        <span className="text-[11px] font-medium text-[#1f1f1f]">Signing in...</span>
      ) : (
        <>
          {logo}
          <span className="min-w-0 text-xs font-medium leading-none text-[#1f1f1f] sm:text-sm">
            {text}
          </span>
        </>
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
    <div className="flex flex-col gap-2">
      <OAuthButton
        label="Sign in with Google"
        text="Sign in with Google"
        onClick={onGoogleSignIn}
        disabled={disabled}
        busy={activeProvider === "google"}
        logo={
          <img
            src={GOOGLE_SIGN_IN_MARK}
            alt=""
            aria-hidden="true"
            className="h-8 w-8 shrink-0 object-contain"
            draggable={false}
          />
        }
      />
      <OAuthButton
        label="Sign in with Apple"
        text="Sign in with Apple"
        onClick={onAppleSignIn}
        disabled={disabled}
        busy={activeProvider === "apple"}
        logo={
          <img
            src={APPLE_SIGN_IN_MARK}
            alt=""
            aria-hidden="true"
            className="h-8 w-8 shrink-0 object-contain"
            draggable={false}
          />
        }
      />
    </div>
  );
}
