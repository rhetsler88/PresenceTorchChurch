import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bluetooth, BluetoothConnected, UserCog, LogOut, Shield, Volume2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { getDisplayName, getInitials } from "@/lib/userUtils";
import { ADMIN_APP_URL } from "@/lib/appLinks";
import { useBluetoothPTTContext } from "@/components/ptt/BluetoothPTTContext";
import EditProfileDialog from "@/components/profile/EditProfileDialog";
import AudioSettingsDialog from "@/components/profile/AudioSettingsDialog";

export default function UserMenu() {
  const { user, logout } = useAuth();
  const bluetooth = useBluetoothPTTContext();
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);

  if (!user) return null;

  const displayName = getDisplayName(user);
  const initials = getInitials(user);
  const isPlatformAdmin = user.role === "super_admin" || user.role === "admin";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="fixed z-40 flex items-center gap-2 p-1 sm:pl-1 sm:pr-2.5 rounded-full bg-card border border-border shadow-sm hover:border-primary/40 transition-colors active:scale-95 right-[calc(1.75rem+env(safe-area-inset-right,0px))]"
            style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
            title="Account menu"
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold leading-none text-primary">
              {initials}
            </span>
            <span className="text-xs font-semibold text-foreground max-w-[7rem] truncate hidden sm:inline">
              {displayName}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground truncate">{displayName}</span>
              {user.email && (
                <span className="text-xs text-muted-foreground truncate">{user.email}</span>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowEditProfile(true)}>
            <UserCog className="w-4 h-4" />
            Edit profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowAudioSettings(true)}>
            <Volume2 className="w-4 h-4" />
            Audio settings
          </DropdownMenuItem>
          {bluetooth && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!bluetooth.isSupported || bluetooth.isConnecting}
                onSelect={(event) => {
                  event.preventDefault();
                  if (!bluetooth.isSupported) return;
                  if (bluetooth.isConnected) {
                    bluetooth.disconnect();
                    return;
                  }
                  void bluetooth.connect();
                }}
              >
                {bluetooth.isConnected ? (
                  <>
                    <BluetoothConnected className="w-4 h-4 text-green-500" />
                    <span className="truncate">
                      {bluetooth.deviceName || "BLE button"}
                    </span>
                  </>
                ) : (
                  <>
                    <Bluetooth className="w-4 h-4" />
                    {bluetooth.isConnecting ? "Pairing BLE button..." : "Pair BLE button"}
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal leading-snug whitespace-normal">
                Pair a BLE GATT button (service FFF0) or use buttons already paired in your phone&apos;s Bluetooth settings.
                Press and hold to talk on Talk or Monitor.
              </DropdownMenuLabel>
              {!bluetooth.isSupported && (
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal leading-snug whitespace-normal">
                  BLE pairing requires the mobile app (Android or iOS).
                </DropdownMenuLabel>
              )}
              {bluetooth.error && (
                <DropdownMenuLabel className="text-xs text-destructive font-normal leading-snug whitespace-normal">
                  {bluetooth.error}
                </DropdownMenuLabel>
              )}
            </>
          )}
          {isPlatformAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href={ADMIN_APP_URL}>
                  <Shield className="w-4 h-4" />
                  Admin dashboard
                </a>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => logout(true)}
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditProfileDialog open={showEditProfile} onOpenChange={setShowEditProfile} />
      <AudioSettingsDialog open={showAudioSettings} onOpenChange={setShowAudioSettings} />
    </>
  );
}
