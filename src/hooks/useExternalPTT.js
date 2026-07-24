import { useEffect, useRef } from "react";
import { useBluetoothPTTContext } from "@/components/ptt/BluetoothPTTContext";
import useWiredPTT from "@/hooks/useWiredPTT";

/** Wire Bluetooth + wired/media PTT buttons to the active page handlers. */
export default function useExternalPTT({ onPress, onRelease }) {
  const bluetooth = useBluetoothPTTContext();
  const onPressRef = useRef(onPress);
  const onReleaseRef = useRef(onRelease);

  useEffect(() => {
    onPressRef.current = onPress;
    onReleaseRef.current = onRelease;
  }, [onPress, onRelease]);

  const registerHandlers = bluetooth?.registerHandlers;

  useEffect(() => {
    if (!registerHandlers) return undefined;

    registerHandlers(
      () => onPressRef.current?.(),
      () => onReleaseRef.current?.()
    );

    return () => {
      registerHandlers(null, null);
    };
  }, [registerHandlers]);

  useWiredPTT({ onPress, onRelease });
}
