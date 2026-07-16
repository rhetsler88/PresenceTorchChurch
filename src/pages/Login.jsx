import React from "react";
import AuthSignInPanel from "@/components/auth/AuthSignInPanel";

export default function Login() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background dark p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img
            src="/logo-full.png"
            alt="Presence Torch Church"
            className="w-full max-w-[220px] h-auto object-contain mb-4"
            draggable={false}
          />
          <h1 className="text-2xl font-bold text-foreground">Presence Torch</h1>
          <p className="text-sm text-muted-foreground text-center mt-2">
            Push-to-talk communication for your team
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-foreground text-center mb-1">
            Sign in to continue
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Use email or Google to access your organization&apos;s channels
          </p>

          <AuthSignInPanel />
        </div>
      </div>
    </div>
  );
}
