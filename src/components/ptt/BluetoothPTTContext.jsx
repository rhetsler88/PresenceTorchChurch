import React, { createContext, useContext, useState, useCallback } from "react";
import useBluetoothPTT from "@/hooks/useBluetoothPTT";

const BluetoothPTTContext = createContext(null);

export function BluetoothPTTProvider({ children }) {
  const [handlers, setHandlers] = useState({ onPress: null, onRelease: null });

  const bluetooth = useBluetoothPTT({
    onPress: handlers.onPress,
    onRelease: handlers.onRelease,
  });

  const registerHandlers = useCallback((onPress, onRelease) => {
    setHandlers({ onPress, onRelease });
  }, []);

  return (
    <BluetoothPTTContext.Provider value={{ ...bluetooth, registerHandlers }}>
      {children}
    </BluetoothPTTContext.Provider>
  );
}

export function useBluetoothPTTContext() {
  return useContext(BluetoothPTTContext);
}