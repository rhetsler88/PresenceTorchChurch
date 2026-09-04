/**
 * Bluetooth PTT button coding: BLE notify bitmasks, SPP ASCII, and common GATT profiles.
 */

/** HM-10 / TI CC254x transparent UART used by many BLE PTT buttons. */
export const TRANSPARENT_UART_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
export const TRANSPARENT_UART_CHAR_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb";

/** Generic BLE PTT modules that expose FFF0/FFF1 instead of FFE0/FFE1. */
export const PTT_SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb";
export const PTT_CHAR_UUID = "0000fff1-0000-1000-8000-00805f9b34fb";

/** Nordic UART Service (NUS) — used by some DIY BLE PTT buttons. */
export const NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const NUS_TX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

export const HID_SERVICE_UUID = "00001812-0000-1000-8000-00805f9b34fb";
export const GENERIC_ACCESS_UUID = "00001800-0000-1000-8000-00805f9b34fb";
export const GENERIC_ATTRIBUTE_UUID = "00001801-0000-1000-8000-00805f9b34fb";
export const BATTERY_SERVICE_UUID = "0000180f-0000-1000-8000-00805f9b34fb";
export const DEVICE_INFO_UUID = "0000180a-0000-1000-8000-00805f9b34fb";

/** BLE notification bitmasks for multi-button accessories. */
export const PTT_BIT_PRIMARY = 0x01;
export const PTT_BIT_SOS = 0x02;
export const PTT_BIT_SECONDARY = 0x04;
export const PTT_BIT_CHANNEL_DOWN = 0x08;
export const PTT_BIT_CHANNEL_UP = 0x10;
export const PTT_HOLD_MASK = PTT_BIT_PRIMARY | PTT_BIT_SECONDARY;
export const PTT_BLE_BITMASK_MAX = 0x1f;

/** USB-C CDC-DATA PTT keycodes (odd second byte = pressed). */
export const CDC_KEYCODE_PTT = 0x46;
export const CDC_KEYCODE_PTT2 = 0x66;

/** SPP ASCII commands (also arrive over FFE1 / NUS transparent UART). */
export const SPP_PTT_DOWN = "+PTTS=P";
export const SPP_PTT_UP = "+PTTS=R";

/** Prefer these notify characteristics, transparent UART first. */
export const PTT_NOTIFY_TARGETS = [
  { serviceUuid: TRANSPARENT_UART_SERVICE_UUID, characteristicUuid: TRANSPARENT_UART_CHAR_UUID },
  { serviceUuid: PTT_SERVICE_UUID, characteristicUuid: PTT_CHAR_UUID },
  { serviceUuid: NUS_SERVICE_UUID, characteristicUuid: NUS_TX_CHAR_UUID },
];

/** Services that identify a PTT button in a native BLE scan (OR filters). */
export const BLE_SCAN_SERVICES = [
  TRANSPARENT_UART_SERVICE_UUID,
  PTT_SERVICE_UUID,
  HID_SERVICE_UUID,
  NUS_SERVICE_UUID,
];

export const BLE_OPTIONAL_SERVICES = [
  TRANSPARENT_UART_SERVICE_UUID,
  PTT_SERVICE_UUID,
  NUS_SERVICE_UUID,
  HID_SERVICE_UUID,
  GENERIC_ACCESS_UUID,
  GENERIC_ATTRIBUTE_UUID,
  BATTERY_SERVICE_UUID,
  DEVICE_INFO_UUID,
];

const STANDARD_NOTIFY_SKIP = new Set([
  GENERIC_ACCESS_UUID,
  GENERIC_ATTRIBUTE_UUID,
  BATTERY_SERVICE_UUID,
  DEVICE_INFO_UUID,
]);

export function normalizeBleUuid(uuid) {
  if (uuid == null) return "";
  const raw = String(uuid).trim().toLowerCase();
  if (/^[0-9a-f]{4}$/.test(raw)) {
    return `0000${raw}-0000-1000-8000-00805f9b34fb`;
  }
  if (/^0x[0-9a-f]{4}$/.test(raw)) {
    return `0000${raw.slice(2)}-0000-1000-8000-00805f9b34fb`;
  }
  return raw;
}

export function isPreferredPttCharacteristic(serviceUuid, characteristicUuid) {
  const service = normalizeBleUuid(serviceUuid);
  const characteristic = normalizeBleUuid(characteristicUuid);
  return PTT_NOTIFY_TARGETS.some(
    (target) =>
      target.serviceUuid === service && target.characteristicUuid === characteristic
  );
}

export function isStandardServiceToSkip(serviceUuid) {
  return STANDARD_NOTIFY_SKIP.has(normalizeBleUuid(serviceUuid));
}

function toBytes(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  if (value instanceof DataView) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value);
  }
  if (value.buffer) {
    return new Uint8Array(value.buffer);
  }
  return null;
}

function bytesToAscii(bytes) {
  let text = "";
  for (const byte of bytes) {
    if (byte === 0) break;
    text += String.fromCharCode(byte);
  }
  return text;
}

function parseSppAscii(text) {
  const upper = text.toUpperCase().replace(/\s+/g, "");
  if (!upper.includes("+PTT")) return null;
  if (upper.includes("+PTTS=P") || upper.includes("+PTT=P")) return true;
  if (upper.includes("+PTTS=R") || upper.includes("+PTT=R")) return false;
  // Channel / SOS SPP commands are not primary PTT.
  if (upper.includes("+PTTB") || upper.includes("+PTTE")) return false;
  return null;
}

/**
 * Parse a BLE notify / UART payload into a PTT hold state.
 * Handles BLE bitmasks, SPP ASCII, CDC keycodes, then generic 0x01/0x00.
 */
export function parseBleButtonState(value) {
  const bytes = toBytes(value);
  if (!bytes || bytes.length === 0) return false;

  const spp = parseSppAscii(bytesToAscii(bytes));
  if (spp !== null) return spp;

  if (
    bytes.length >= 2
    && (bytes[0] === CDC_KEYCODE_PTT || bytes[0] === CDC_KEYCODE_PTT2)
  ) {
    return (bytes[1] & 1) === 1;
  }

  const allInBitmaskRange = bytes.every((byte) => byte <= PTT_BLE_BITMASK_MAX);
  if (allInBitmaskRange) {
    return bytes.some((byte) => (byte & PTT_HOLD_MASK) !== 0);
  }

  return bytes.some((byte) => byte !== 0);
}
