import React from "react";
import { Download, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/usePwaInstall";

export default function PwaInstallPrompt() {
  const { showPrompt, canInstall, isInstalling, install, isIosSafari } = usePwaInstall();

  if (!showPrompt) return null;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Install Presence Torch</p>
          <p className="text-sm text-muted-foreground leading-snug">
            Add the app to your home screen for faster access, full-screen use, and red-alert
            notifications when the app is in the background.
          </p>
        </div>
      </div>

      {isIosSafari ? (
        <div className="rounded-lg bg-background/80 border border-border px-3 py-2 text-xs text-muted-foreground leading-relaxed">
          <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
            <Share className="h-3.5 w-3.5" />
            Install on iPhone or iPad
          </p>
          Tap <span className="font-medium text-foreground">Share</span>, then{" "}
          <span className="font-medium text-foreground">Add to Home Screen</span>.
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          size="lg"
          onClick={() => void install()}
          disabled={!canInstall || isInstalling}
        >
          <Download className="h-4 w-4 mr-2" />
          {isInstalling ? "Opening install..." : "Install app"}
        </Button>
      )}
    </div>
  );
}
