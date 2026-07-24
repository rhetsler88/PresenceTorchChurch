import React, { createContext, useContext, useRef, useCallback, useMemo } from "react";
import useBluetoothPTT from "@/hooks/useBluetoothPTT";

const BluetoothPTTContext = createContext(null);

export function BluetoothPTTProvider({ children }) {
  const handlersRef = useRef({ onPress: null, onRelease: null });

  const bluetooth = useBluetoothPTT({
    onPress: () => handlersRef.current.onPress?.(),
    onRelease: () => handlersRef.current.onRelease?.(),
  });

  const registerHandlers = useCallback((onPress, onRelease) => {
    handlersRef.current = { onPress, onRelease };
  }, []);

  const value = useMemo(
    () => ({ ...bluetooth, registerHandlers }),
    [bluetooth, registerHandlers]
  );

  return (
    <BluetoothPTTContext.Provider value={value}>
      {children}
    </BluetoothPTTContext.Provider>
  );
}

export function useBluetoothPTTContext() {
  return useContext(BluetoothPTTContext);
}
