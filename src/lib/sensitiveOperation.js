import { Capacitor } from "@capacitor/core";
import { syncNativeSensitiveOperation } from "@/lib/sessionGuardNative";

let depth = 0;

/** Blocks background logout / native immediate logout while mic or biometric UI is active. */
export function beginSensitiveOperation() {
  depth += 1;
  if (depth === 1) {
    void syncNativeSensitiveOperation(true).catch(() => {});
  }
}

export function endSensitiveOperation() {
  depth = Math.max(0, depth - 1);
  if (depth === 0) {
    void syncNativeSensitiveOperation(false).catch(() => {});
  }
}

export function isSensitiveOperationActive() {
  return depth > 0;
}

export function isNativePlatform() {
  return Capacitor.isNativePlatform();
}
