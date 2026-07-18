import { useState, useRef, useCallback, useEffect } from "react";
import { ensureBluetoothPermissions } from "@/lib/bluetoothPermissions";

// Common service UUIDs for Bluetooth PTT / HID buttons
const OPTIONAL_SERVICES = [
  "00001812-0000-1000-8000-00805f9b34fb", // Human Interface Device
  "00001800-0000-1000-8000-00805f9b34fb", // Generic Access
  "00001801-0000-1000-8000-00805f9b34fb", // Generic Attribute
  "0000180f-0000-1000-8000-00805f9b34fb", // Battery Service
  "0000180a-0000-1000-8000-00805f9b34fb", // Device Information
  "0000fe59-0000-1000-8000-00805f9b34fb", // Common custom (Nordic UART)
  "0000fff0-0000-1000-8000-00805f9b34fb", // Common custom button service
];

export default function useBluetoothPTT({ onPress, onRelease }) {
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const deviceRef = useRef(null);
  const characteristicsRef = useRef([]);
  const pressStateRef = useRef(false);
  const callbacksRef = useRef({ onPress, onRelease });

  useEffect(() => {
    callbacksRef.current = { onPress, onRelease };
  }, [onPress, onRelease]);

  const isSupported = typeof navigator !== "undefined" && !!navigator.bluetooth;

  const handleValueChanged = useCallback((event) => {
    const value = event.target.value;
    const data = new Uint8Array(value.buffer);
    // Treat any non-zero byte as a button press
    const isPressed = data.some(byte => byte !== 0);

    if (isPressed && !pressStateRef.current) {
      pressStateRef.current = true;
      callbacksRef.current.onPress?.();
    } else if (!isPressed && pressStateRef.current) {
      pressStateRef.current = false;
      callbacksRef.current.onRelease?.();
    }
  }, []);

  const handleDisconnected = useCallback(() => {
    setIsConnected(false);
    setDeviceName(null);
    pressStateRef.current = false;
  }, []);

  const connect = useCallback(async () => {
    if (!navigator.bluetooth) return;
    setIsConnecting(true);
    setError(null);
    try {
      await ensureBluetoothPermissions();
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: OPTIONAL_SERVICES,
      });

      deviceRef.current = device;
      device.addEventListener("gattserverdisconnected", handleDisconnected);

      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices();
      const foundCharacteristics = [];

      for (const service of services) {
        try {
          const characteristics = await service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.notify) {
              char.addEventListener("characteristicvaluechanged", handleValueChanged);
              await char.startNotifications();
              foundCharacteristics.push(char);
            }
          }
        } catch {
          // Some services may not be accessible — skip them
        }
      }

      characteristicsRef.current = foundCharacteristics;
      setDeviceName(device.name || "Bluetooth Button");
      setIsConnected(true);
    } catch (err) {
      setError(err.message || "Failed to connect");
    } finally {
      setIsConnecting(false);
    }
  }, [handleValueChanged, handleDisconnected]);

  const disconnect = useCallback(() => {
    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }
    characteristicsRef.current = [];
    setIsConnected(false);
    setDeviceName(null);
    pressStateRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      if (deviceRef.current?.gatt?.connected) {
        deviceRef.current.gatt.disconnect();
      }
    };
  }, []);

  return { isSupported, isConnected, isConnecting, deviceName, error, connect, disconnect };
}