import React from "react";
import { PTTHandlerProvider } from "@/components/ptt/PTTHandlerProvider";
import useGlobalPTT from "@/hooks/useGlobalPTT";

function GlobalPTTBridge({ children }) {
  const fallback = useGlobalPTT();
  const handlers = fallback.enabled
    ? { onPress: fallback.onPress, onRelease: fallback.onRelease }
    : null;

  return (
    <PTTHandlerProvider fallbackHandlers={handlers}>
      {children}
    </PTTHandlerProvider>
  );
}

export default GlobalPTTBridge;
