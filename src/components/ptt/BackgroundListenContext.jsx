import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import useBackgroundRelayListen from "@/hooks/useBackgroundRelayListen";

const BackgroundListenContext = createContext(null);

/**
 * Keeps the native background-listen session alive across in-app tab switches.
 * Talk and Monitor register listen state here instead of owning the session directly.
 */
export function BackgroundListenProvider({ children }) {
  const sourcesRef = useRef(new Map());
  const [session, setSession] = useState({ enabled: false, title: "Presence Torch" });

  const syncSession = useCallback(() => {
    const sources = sourcesRef.current;
    if (sources.size === 0) {
      setSession({ enabled: false, title: "Presence Torch" });
      return;
    }
    const title = [...sources.values()].at(-1) || "Presence Torch";
    setSession({ enabled: true, title });
  }, []);

  const setBackgroundListen = useCallback(
    (source, { enabled, title = "Presence Torch" } = {}) => {
      if (!source) return;
      if (enabled) {
        sourcesRef.current.set(source, title);
      } else {
        sourcesRef.current.delete(source);
      }
      syncSession();
    },
    [syncSession]
  );

  useBackgroundRelayListen(session);

  const value = useMemo(() => ({ setBackgroundListen }), [setBackgroundListen]);

  return (
    <BackgroundListenContext.Provider value={value}>
      {children}
    </BackgroundListenContext.Provider>
  );
}

export function useBackgroundListenRegistration(source, { enabled, title, persist = false }) {
  const ctx = useContext(BackgroundListenContext);

  React.useEffect(() => {
    if (!ctx?.setBackgroundListen) return undefined;
    ctx.setBackgroundListen(source, { enabled, title });
    if (persist) return undefined;
    return () => {
      ctx.setBackgroundListen(source, { enabled: false });
    };
  }, [ctx, source, enabled, title, persist]);
}
