import React from "react";
import { Database } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function InitializeDatabaseBanner({ seedMutation, user, showInitialize }) {
  if (!showInitialize) return null;

  const isSuperAdmin = user?.role === "super_admin";

  return (
    <div className="mx-8 mt-6 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 flex-1">
        <Database className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-foreground">Database not initialized</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isSuperAdmin
              ? "Seed Potter's House - Columbus with Safety Team and PH Kids channels so new users can complete onboarding."
              : "Default channels are missing. Initialize Safety Team and PH Kids for your organization."}
          </p>
        </div>
      </div>
      <Button
        onClick={() => seedMutation.mutate()}
        disabled={seedMutation.isPending}
        className="flex-shrink-0"
      >
        {seedMutation.isPending ? "Initializing..." : "Initialize database"}
      </Button>
    </div>
  );
}
