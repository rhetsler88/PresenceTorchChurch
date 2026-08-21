import React from "react";
import { Link } from "react-router-dom";
import AuthSignInPanel from "@/components/auth/AuthSignInPanel";
import PwaInstallPrompt from "@/components/pwa/PwaInstallPrompt";

export default function Login() {
  return (
    <div className="h-dvh overflow-hidden flex flex-col bg-background dark safe-top safe-bottom px-4 py-3">
      <div className="flex-1 min-h-0 w-full max-w-sm mx-auto flex flex-col justify-center">
        <div className="flex flex-col items-center mb-3 shrink-0">
          <img
            src="/logo-full.png"
            alt="Presence Torch Church"
            className="w-full max-w-[168px] h-auto object-contain"
            draggable={false}
          />
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 min-h-0 overflow-hidden">
          <h2 className="text-base font-semibold text-foreground text-center mb-0.5">
            Sign in to continue
          </h2>
          <p className="text-xs text-muted-foreground text-center mb-3">
            Use email or Google to access your organization&apos;s channels
          </p>

          <AuthSignInPanel />
        </div>

        <div className="mt-2 shrink-0">
          <PwaInstallPrompt />
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-2 shrink-0">
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
