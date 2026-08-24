/** Common BLE PTT button service/characteristic UUIDs (16-bit FFF0/FFF1 expanded). */
export const PTT_SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb";
export const PTT_CHAR_UUID = "0000fff1-0000-1000-8000-00805f9b34fb";

export const BLE_OPTIONAL_SERVICES = [
  PTT_SERVICE_UUID,
  "00001812-0000-1000-8000-00805f9b34fb", // Human Interface Device
  "00001800-0000-1000-8000-00805f9b34fb", // Generic Access
  "00001801-0000-1000-8000-00805f9b34fb", // Generic Attribute
  "0000180f-0000-1000-8000-00805f9b34fb", // Battery Service
  "0000180a-0000-1000-8000-00805f9b34fb", // Device Information
  "0000fe59-0000-1000-8000-00805f9b34fb", // Nordic UART
];

/** Parse GATT notification bytes — 0x01 = pressed, 0x00 = released. */
export function parseBleButtonState(value) {
  if (!value) return false;
  const bytes = value instanceof DataView
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : new Uint8Array(value.buffer ?? value);
  return bytes.some((byte) => byte !== 0);
}
