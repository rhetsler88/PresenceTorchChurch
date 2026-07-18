import { useEffect } from "react";
import { useBluetoothPTTContext } from "@/components/ptt/BluetoothPTTContext";
import useWiredPTT from "@/hooks/useWiredPTT";

/** Wire Bluetooth + wired/media PTT buttons to the active page handlers. */
export default function useExternalPTT({ onPress, onRelease }) {
  const bluetooth = useBluetoothPTTContext();

  useEffect(() => {
    bluetooth?.registerHandlers(onPress, onRelease);
    return () => bluetooth?.registerHandlers(null, null);
  }, [onPress, onRelease, bluetooth]);

  useWiredPTT({ onPress, onRelease });
}
