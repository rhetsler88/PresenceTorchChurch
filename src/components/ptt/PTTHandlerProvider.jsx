import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import useExternalPTT from "@/hooks/useExternalPTT";
import { getLastPttSurface } from "@/lib/lastPttSurface";

const PTTHandlerContext = createContext(null);

export function PTTHandlerProvider({ children, fallbackHandlers = null }) {
  const pageHandlersRef = useRef(null);
  const stickyHandlersRef = useRef({ talk: null, monitor: null });
  const fallbackRef = useRef(fallbackHandlers);

  useEffect(() => {
    fallbackRef.current = fallbackHandlers;
  }, [fallbackHandlers]);

  const registerPageHandlers = useCallback((handlers, surface) => {
    pageHandlersRef.current = handlers;
    if (surface === "talk" || surface === "monitor") {
      stickyHandlersRef.current[surface] = handlers;
    }
  }, []);

  const unregisterPageHandlers = useCallback(() => {
    pageHandlersRef.current = null;
  }, []);

  const dispatchPress = useCallback(() => {
    const page = pageHandlersRef.current;
    if (page?.onPress) {
      page.onPress();
      return;
    }

    const sticky = stickyHandlersRef.current[getLastPttSurface()];
    if (sticky?.onPress) {
      sticky.onPress();
      return;
    }

    fallbackRef.current?.onPress?.();
  }, []);

  const dispatchRelease = useCallback(() => {
    const page = pageHandlersRef.current;
    if (page?.onRelease) {
      page.onRelease();
      return;
    }

    const sticky = stickyHandlersRef.current[getLastPttSurface()];
    if (sticky?.onRelease) {
      sticky.onRelease();
      return;
    }

    fallbackRef.current?.onRelease?.();
  }, []);

  useExternalPTT({
    onPress: dispatchPress,
    onRelease: dispatchRelease,
  });

  const value = useMemo(
    () => ({ registerPageHandlers, unregisterPageHandlers }),
    [registerPageHandlers, unregisterPageHandlers]
  );

  return (
    <PTTHandlerContext.Provider value={value}>
      {children}
    </PTTHandlerContext.Provider>
  );
}

export function useRegisterPagePTTHandlers(handlers, { surface } = {}) {
  const ctx = useContext(PTTHandlerContext);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!ctx) return undefined;
    ctx.registerPageHandlers(
      {
        onPress: () => handlersRef.current?.onPress?.(),
        onRelease: () => handlersRef.current?.onRelease?.(),
      },
      surface
    );
    return () => ctx.unregisterPageHandlers();
  }, [ctx, surface]);
}
