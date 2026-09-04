import { useState, useRef, useCallback, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { ensureBluetoothPermissions } from "@/lib/bluetoothPermissions";
import {
  BLE_OPTIONAL_SERVICES,
  BLE_SCAN_SERVICES,
  PTT_NOTIFY_TARGETS,
  isStandardServiceToSkip,
  parseBleButtonState,
} from "@/lib/blePttConstants";

function hasWebBluetooth() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

function hasNativeBlePlugin() {
  return Capacitor.isNativePlatform();
}

async function loadBleClient() {
  const mod = await import("@capacitor-community/bluetooth-le");
  return mod.BleClient;
}

async function subscribeCharacteristic(char, onValueChanged, bucket) {
  char.addEventListener("characteristicvaluechanged", onValueChanged);
  await char.startNotifications();
  bucket.push(char);
}

async function subscribeWebBluetoothNotifications(device, onValueChanged) {
  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();
  const foundCharacteristics = [];

  for (const target of PTT_NOTIFY_TARGETS) {
    try {
      const service = await server.getPrimaryService(target.serviceUuid);
      const char = await service.getCharacteristic(target.characteristicUuid);
      if (char.properties.notify) {
        await subscribeCharacteristic(char, onValueChanged, foundCharacteristics);
      }
    } catch {
      // Service or characteristic not present on this button.
    }
  }

  if (foundCharacteristics.length > 0) {
    return foundCharacteristics;
  }

  for (const service of services) {
    if (isStandardServiceToSkip(service.uuid)) continue;
    try {
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.notify) {
          await subscribeCharacteristic(char, onValueChanged, foundCharacteristics);
        }
      }
    } catch {
      // Some services may not be accessible — skip them
    }
  }

  return foundCharacteristics;
}

async function subscribeNativeBleNotifications(deviceId, onValueChanged) {
  const BleClient = await loadBleClient();
  await BleClient.discoverServices(deviceId);
  const services = await BleClient.getServices(deviceId);
  const subscribed = [];

  const trySubscribe = async (serviceUuid, characteristicUuid) => {
    try {
      await BleClient.startNotifications(
        deviceId,
        serviceUuid,
        characteristicUuid,
        (value) => onValueChanged({ target: { value } })
      );
      subscribed.push({ serviceUuid, characteristicUuid });
      return true;
    } catch {
      return false;
    }
  };

  for (const target of PTT_NOTIFY_TARGETS) {
    if (await trySubscribe(target.serviceUuid, target.characteristicUuid)) {
      return subscribed;
    }
  }

  for (const service of services) {
    if (isStandardServiceToSkip(service.uuid)) continue;
    for (const characteristic of service.characteristics ?? []) {
      if (!characteristic.properties?.notify) continue;
      if (await trySubscribe(service.uuid, characteristic.uuid)) {
        return subscribed;
      }
    }
  }

  return subscribed;
}

export default function useBluetoothPTT({ onPress, onRelease }) {
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const deviceRef = useRef(null);
  const nativeDeviceIdRef = useRef(null);
  const nativeSubscriptionsRef = useRef([]);
  const webCharacteristicsRef = useRef([]);
  const pressStateRef = useRef(false);
  const callbacksRef = useRef({ onPress, onRelease });
  const bleInitializedRef = useRef(false);

  const isSupported = hasWebBluetooth() || hasNativeBlePlugin();

  useEffect(() => {
    callbacksRef.current = { onPress, onRelease };
  }, [onPress, onRelease]);

  const handleValueChanged = useCallback((event) => {
    const value = event.target?.value ?? event;
    const isPressed = parseBleButtonState(value);

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
    nativeDeviceIdRef.current = null;
    nativeSubscriptionsRef.current = [];
    webCharacteristicsRef.current = [];
  }, []);

  const connectNative = useCallback(async () => {
    const BleClient = await loadBleClient();
    if (!bleInitializedRef.current) {
      await BleClient.initialize({ androidNeverForLocation: true });
      bleInitializedRef.current = true;
    }

    await ensureBluetoothPermissions();

    const device = await BleClient.requestDevice({
      services: BLE_SCAN_SERVICES,
      optionalServices: BLE_OPTIONAL_SERVICES,
    });

    await BleClient.connect(device.deviceId, () => handleDisconnected());
    nativeDeviceIdRef.current = device.deviceId;

    const subscriptions = await subscribeNativeBleNotifications(
      device.deviceId,
      handleValueChanged
    );

    if (subscriptions.length === 0) {
      await BleClient.disconnect(device.deviceId);
      nativeDeviceIdRef.current = null;
      setError(
        "Device connected but no PTT button notifications were found. Zello-style buttons expose service FFE0 / characteristic FFE1 (or FFF0 / FFF1)."
      );
      return;
    }

    nativeSubscriptionsRef.current = subscriptions;
    deviceRef.current = device;
    setDeviceName(device.name || "BLE PTT Button");
    setIsConnected(true);
  }, [handleDisconnected, handleValueChanged]);

  const connectWeb = useCallback(async () => {
    /** @type {BluetoothDevice} */
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_OPTIONAL_SERVICES,
    });

    deviceRef.current = device;
    device.addEventListener("gattserverdisconnected", handleDisconnected);

    const foundCharacteristics = await subscribeWebBluetoothNotifications(
      device,
      handleValueChanged
    );

    if (foundCharacteristics.length === 0) {
      device.removeEventListener("gattserverdisconnected", handleDisconnected);
      device.gatt.disconnect();
      deviceRef.current = null;
      setError(
        "Device connected but no button events were detected. Most buttons work when paired in your phone's Bluetooth settings — no in-app pairing needed. Open Talk and press the button."
      );
      return;
    }

    webCharacteristicsRef.current = foundCharacteristics;
    setDeviceName(device.name || "Bluetooth Button");
    setIsConnected(true);
  }, [handleDisconnected, handleValueChanged]);

  const connect = useCallback(async () => {
    if (!isSupported) return;
    setIsConnecting(true);
    setError(null);
    try {
      if (hasWebBluetooth()) {
        await connectWeb();
      } else {
        await connectNative();
      }
    } catch (err) {
      setError(err.message || "Failed to connect");
    } finally {
      setIsConnecting(false);
    }
  }, [connectNative, connectWeb, isSupported]);

  const disconnect = useCallback(async () => {
    if (nativeDeviceIdRef.current) {
      try {
        const BleClient = await loadBleClient();
        for (const sub of nativeSubscriptionsRef.current) {
          await BleClient.stopNotifications(
            nativeDeviceIdRef.current,
            sub.serviceUuid,
            sub.characteristicUuid
          ).catch(() => {});
        }
        await BleClient.disconnect(nativeDeviceIdRef.current).catch(() => {});
      } catch {
        // ignore native disconnect errors
      }
    }

    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }

    deviceRef.current = null;
    nativeDeviceIdRef.current = null;
    nativeSubscriptionsRef.current = [];
    webCharacteristicsRef.current = [];
    setIsConnected(false);
    setDeviceName(null);
    setError(null);
    pressStateRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      void disconnect();
    };
  }, [disconnect]);

  return { isSupported, isConnected, isConnecting, deviceName, error, connect, disconnect };
}
