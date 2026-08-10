import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { isIosSafari, isPwaInstalled } from "@/lib/pushDevice";

export function usePwaInstall() {
  const deferredPromptRef = useRef(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return undefined;

    setIsInstalled(isPwaInstalled());

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      deferredPromptRef.current = event;
      setCanInstall(true);
    };

    const onAppInstalled = () => {
      deferredPromptRef.current = null;
      setCanInstall(false);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    const promptEvent = deferredPromptRef.current;
    if (!promptEvent) return false;

    setIsInstalling(true);
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      deferredPromptRef.current = null;
      setCanInstall(false);
      if (outcome === "accepted") setIsInstalled(true);
      return outcome === "accepted";
    } finally {
      setIsInstalling(false);
    }
  }, []);

  const showPrompt =
    !Capacitor.isNativePlatform() &&
    !isInstalled &&
    (canInstall || isIosSafari());

  return {
    canInstall,
    isInstalled,
    isInstalling,
    install,
    showPrompt,
    isIosSafari: isIosSafari(),
  };
}
