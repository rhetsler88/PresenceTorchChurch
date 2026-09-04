import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ZELLO_UART_SERVICE_UUID,
  ZELLO_UART_CHAR_UUID,
  PTT_SERVICE_UUID,
  PTT_CHAR_UUID,
  NUS_SERVICE_UUID,
  NUS_TX_CHAR_UUID,
  BLE_SCAN_SERVICES,
  BLE_OPTIONAL_SERVICES,
  ZELLO_BIT_PTT_PRIMARY,
  ZELLO_BIT_PTT_SECONDARY,
  ZELLO_BIT_SOS,
  ZELLO_BIT_CHANNEL_DOWN,
  ZELLO_BIT_CHANNEL_UP,
  ZELLO_CDC_KEYCODE_PTT,
  ZELLO_CDC_KEYCODE_PTT2,
  isPreferredPttCharacteristic,
  isStandardServiceToSkip,
  parseBleButtonState,
} from "./blePttConstants.js";

function dataViewFrom(bytes) {
  const array = Uint8Array.from(bytes);
  return new DataView(array.buffer, array.byteOffset, array.byteLength);
}

describe("Zello BLE GATT targets", () => {
  it("prefers FFE0/FFE1 over FFF0/FFF1 and Nordic UART", () => {
    assert.equal(
      isPreferredPttCharacteristic(ZELLO_UART_SERVICE_UUID, ZELLO_UART_CHAR_UUID),
      true
    );
    assert.equal(isPreferredPttCharacteristic("FFE0", "FFE1"), true);
    assert.equal(isPreferredPttCharacteristic(PTT_SERVICE_UUID, PTT_CHAR_UUID), true);
    assert.equal(isPreferredPttCharacteristic(NUS_SERVICE_UUID, NUS_TX_CHAR_UUID), true);
    assert.equal(
      isPreferredPttCharacteristic(PTT_SERVICE_UUID, ZELLO_UART_CHAR_UUID),
      false
    );
  });

  it("includes Zello UART in scan and optional service lists", () => {
    assert.ok(BLE_SCAN_SERVICES.includes(ZELLO_UART_SERVICE_UUID));
    assert.ok(BLE_OPTIONAL_SERVICES.includes(ZELLO_UART_SERVICE_UUID));
    assert.ok(BLE_SCAN_SERVICES.includes(PTT_SERVICE_UUID));
  });

  it("skips standard SIG services that are not PTT", () => {
    assert.equal(isStandardServiceToSkip("180f"), true);
    assert.equal(isStandardServiceToSkip(ZELLO_UART_SERVICE_UUID), false);
  });
});

describe("Zello BLE bitmask coding", () => {
  it("treats 0x01 primary PTT as pressed and 0x00 as released", () => {
    assert.equal(parseBleButtonState(Uint8Array.of(ZELLO_BIT_PTT_PRIMARY)), true);
    assert.equal(parseBleButtonState(Uint8Array.of(0x00)), false);
    assert.equal(parseBleButtonState(dataViewFrom([0x01])), true);
  });

  it("treats 0x04 secondary PTT as pressed", () => {
    assert.equal(parseBleButtonState(Uint8Array.of(ZELLO_BIT_PTT_SECONDARY)), true);
  });

  it("does not treat SOS or channel bits as PTT", () => {
    assert.equal(parseBleButtonState(Uint8Array.of(ZELLO_BIT_SOS)), false);
    assert.equal(parseBleButtonState(Uint8Array.of(ZELLO_BIT_CHANNEL_DOWN)), false);
    assert.equal(parseBleButtonState(Uint8Array.of(ZELLO_BIT_CHANNEL_UP)), false);
  });

  it("still talks when PTT is combined with SOS or channel bits", () => {
    assert.equal(
      parseBleButtonState(Uint8Array.of(ZELLO_BIT_PTT_PRIMARY | ZELLO_BIT_SOS)),
      true
    );
    assert.equal(
      parseBleButtonState(Uint8Array.of(ZELLO_BIT_PTT_PRIMARY | ZELLO_BIT_CHANNEL_UP)),
      true
    );
  });
});

describe("Zello SPP ASCII coding", () => {
  it("parses +PTTS=P / +PTTS=R", () => {
    assert.equal(parseBleButtonState("+PTTS=P"), true);
    assert.equal(parseBleButtonState("+PTTS=R"), false);
    assert.equal(parseBleButtonState(new TextEncoder().encode("+PTTS=P\r\n")), true);
    assert.equal(parseBleButtonState(new TextEncoder().encode("+PTTS=R\r\n")), false);
  });

  it("parses the ProPTT2 +PTT=P variant and ignores channel/SOS SPP", () => {
    assert.equal(parseBleButtonState("+PTT=P"), true);
    assert.equal(parseBleButtonState("+PTT=R"), false);
    assert.equal(parseBleButtonState("+PTTB1=P"), false);
    assert.equal(parseBleButtonState("+PTTE=P"), false);
  });
});

describe("Zello CDC keycodes and generic fallback", () => {
  it("parses two-byte CDC-DATA PTT keycodes (odd = pressed)", () => {
    assert.equal(parseBleButtonState(Uint8Array.of(ZELLO_CDC_KEYCODE_PTT, 0x01)), true);
    assert.equal(parseBleButtonState(Uint8Array.of(ZELLO_CDC_KEYCODE_PTT, 0x00)), false);
    assert.equal(parseBleButtonState(Uint8Array.of(ZELLO_CDC_KEYCODE_PTT2, 0x03)), true);
    assert.equal(parseBleButtonState(Uint8Array.of(ZELLO_CDC_KEYCODE_PTT2, 0x02)), false);
  });

  it("treats proprietary non-zero payloads outside the bitmask range as pressed", () => {
    assert.equal(parseBleButtonState(Uint8Array.of(0xff)), true);
    assert.equal(parseBleButtonState(null), false);
    assert.equal(parseBleButtonState(new Uint8Array()), false);
  });
});
