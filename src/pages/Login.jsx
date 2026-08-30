import React from "react";
import { Link } from "react-router-dom";
import AuthSignInPanel from "@/components/auth/AuthSignInPanel";
import PwaInstallPrompt from "@/components/pwa/PwaInstallPrompt";

export default function Login() {
  return (
    <div className="page-adaptive bg-background dark">
      <div className="page-adaptive-inner-scroll w-full max-w-sm mx-auto px-4 sm:px-6">
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shrink-0">
          <img
            src="/logo-signin-banner.png"
            alt="Presence Torch Church"
            className="w-full max-h-28 sm:max-h-32 h-auto object-contain mb-3 mx-auto"
            draggable={false}
          />
          <h2 className="text-base sm:text-lg font-semibold text-foreground text-center mb-1">
            Sign in to continue
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground text-center mb-3 leading-snug">
            Use email, Google, or Apple to access your organization&apos;s channels
          </p>

          <AuthSignInPanel />
        </div>

        <div className="shrink-0">
          <PwaInstallPrompt />
        </div>

        <p className="text-center text-[11px] sm:text-xs text-muted-foreground shrink-0 pb-1">
          <Link to="/privacy" className="hover:text-foreground underline-offset-2 hover:underline">
            Privacy Policy
          </Link>
          <span className="mx-2">·</span>
          <Link to="/terms" className="hover:text-foreground underline-offset-2 hover:underline">
            Terms of Service
          </Link>
        </p>
      </div>
    </div>
  );
}
