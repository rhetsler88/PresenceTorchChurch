import React from "react";

const GOOGLE_SIGN_IN_MARK = "/icons/google-sign-in-mark.png";
const APPLE_SIGN_IN_MARK = "/icons/apple-sign-in-mark.png";
const APPLE_SIGN_IN_MARK_2X = "/icons/apple-sign-in-mark@2x.png";
const APPLE_SIGN_IN_MARK_3X = "/icons/apple-sign-in-mark@3x.png";

const BUTTON_BASE =
  "relative flex h-11 w-full min-w-0 items-center justify-center rounded-md border border-[#dadce0] bg-white px-3 transition-colors hover:bg-[#f8f9fa] disabled:cursor-not-allowed disabled:opacity-60";

const LOGO_SLOT =
  "pointer-events-none absolute top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center left-[calc(50%-6.5rem)]";

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
          <span className={LOGO_SLOT} aria-hidden="true">
            {logo}
          </span>
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
            className="h-[30px] w-[30px] translate-x-px object-contain"
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
            srcSet={`${APPLE_SIGN_IN_MARK_2X} 2x, ${APPLE_SIGN_IN_MARK_3X} 3x`}
            alt=""
            className="h-8 w-8 object-contain"
            draggable={false}
          />
        }
      />
    </div>
  );
}
