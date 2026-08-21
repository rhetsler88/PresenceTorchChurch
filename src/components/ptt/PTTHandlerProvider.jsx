import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import useExternalPTT from "@/hooks/useExternalPTT";

const PTTHandlerContext = createContext(null);

export function PTTHandlerProvider({ children, fallbackHandlers = null }) {
  const pageHandlersRef = useRef(null);
  const fallbackRef = useRef(fallbackHandlers);

  useEffect(() => {
    fallbackRef.current = fallbackHandlers;
  }, [fallbackHandlers]);

  const registerPageHandlers = useCallback((handlers) => {
    pageHandlersRef.current = handlers;
  }, []);

  const unregisterPageHandlers = useCallback(() => {
    pageHandlersRef.current = null;
  }, []);

  useExternalPTT({
    onPress: () => {
      const page = pageHandlersRef.current;
      if (page?.onPress) {
        page.onPress();
        return;
      }
      fallbackRef.current?.onPress?.();
    },
    onRelease: () => {
      const page = pageHandlersRef.current;
      if (page?.onRelease) {
        page.onRelease();
        return;
      }
      fallbackRef.current?.onRelease?.();
    },
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

export function useRegisterPagePTTHandlers(handlers) {
  const ctx = useContext(PTTHandlerContext);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!ctx) return undefined;
    ctx.registerPageHandlers({
      onPress: () => handlersRef.current?.onPress?.(),
      onRelease: () => handlersRef.current?.onRelease?.(),
    });
    return () => ctx.unregisterPageHandlers();
  }, [ctx]);
}
