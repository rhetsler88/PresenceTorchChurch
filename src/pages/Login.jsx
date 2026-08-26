import React from "react";
import { Link } from "react-router-dom";
import AuthSignInPanel from "@/components/auth/AuthSignInPanel";
import PwaInstallPrompt from "@/components/pwa/PwaInstallPrompt";

export default function Login() {
  return (
    <div className="page-adaptive bg-background dark safe-top safe-bottom">
      <div className="page-adaptive-inner w-full max-w-sm mx-auto px-4 py-6">
        <div className="bg-card border border-border rounded-2xl p-4">
          <img
            src="/logo-signin-banner.png"
            alt="Presence Torch Church"
            className="w-full h-auto object-contain mb-3"
            draggable={false}
          />
          <h2 className="text-base font-semibold text-foreground text-center mb-0.5">
            Sign in to continue
          </h2>
          <p className="text-xs text-muted-foreground text-center mb-3">
            Use email, Google, or Apple to access your organization&apos;s channels
          </p>

          <AuthSignInPanel />
        </div>

        <div className="mt-2">
          <PwaInstallPrompt />
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-2">
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
