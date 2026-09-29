import React from "react";
import { Bluetooth, BluetoothConnected } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BluetoothPTTControl({
  isSupported,
  isConnected,
  isConnecting,
  deviceName,
  onConnect,
  onDisconnect,
}) {
  if (!isSupported) return null;

  if (isConnected) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onDisconnect}
        className="gap-1.5 h-8"
      >
        <BluetoothConnected className="w-3.5 h-3.5 text-green-500" />
        <span className="text-xs max-w-[120px] truncate">{deviceName}</span>
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={onConnect}
        disabled={isConnecting}
        className="gap-1.5 h-8"
      >
        <Bluetooth className="w-3.5 h-3.5" />
        <span className="text-xs">{isConnecting ? "Pairing..." : "Pair Button"}</span>
      </Button>
      <p className="text-[10px] leading-snug text-muted-foreground max-w-[220px] text-right">
        iPhone: open the app and start channel monitoring before using a Bluetooth PTT button with the
        screen off — iOS cannot cold-start the app from the button alone.
      </p>
    </div>
  );
}