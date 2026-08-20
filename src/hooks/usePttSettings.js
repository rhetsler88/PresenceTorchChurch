import { useState, useEffect, useCallback } from "react";
import { getEarbudToggleMode, setEarbudToggleMode as persistEarbudToggleMode } from "@/lib/pttSettings";

export default function usePttSettings() {
  const [earbudToggleMode, setEarbudToggleModeState] = useState(() => getEarbudToggleMode());

  useEffect(() => {
    const sync = () => setEarbudToggleModeState(getEarbudToggleMode());
    window.addEventListener("ptt-settings-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("ptt-settings-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setEarbudToggleMode = useCallback((enabled) => {
    persistEarbudToggleMode(enabled);
    setEarbudToggleModeState(enabled);
  }, []);

  return { earbudToggleMode, setEarbudToggleMode };
}
