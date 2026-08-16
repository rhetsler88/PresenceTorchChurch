import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bluetooth, BluetoothConnected, Headphones, UserCog, LogOut, Shield, UserX } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { getDisplayName, getInitials } from "@/lib/userUtils";
import { ADMIN_APP_URL } from "@/lib/appLinks";
import { useBluetoothPTTContext } from "@/components/ptt/BluetoothPTTContext";
import usePttSettings from "@/hooks/usePttSettings";
import { Switch } from "@/components/ui/switch";
import EditProfileDialog from "@/components/profile/EditProfileDialog";
import DeleteAccountDialog from "@/components/profile/DeleteAccountDialog";

export default function UserMenu() {
  const { user, logout } = useAuth();
  const bluetooth = useBluetoothPTTContext();
  const { earbudToggleMode, setEarbudToggleMode } = usePttSettings();
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  if (!user) return null;

  const displayName = getDisplayName(user);
  const initials = getInitials(user);
  const isPlatformAdmin = user.role === "super_admin" || user.role === "admin";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="fixed z-40 flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-card border border-border shadow-sm hover:border-primary/40 transition-colors active:scale-95 right-[calc(1.75rem+env(safe-area-inset-right,0px))]"
            style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
            title="Account menu"
          >
            <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
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
            Change name
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center justify-between gap-3"
            onSelect={(event) => event.preventDefault()}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Headphones className="w-4 h-4 shrink-0" />
              <span className="text-sm">Earbud tap-to-talk</span>
            </div>
            <Switch
              checked={earbudToggleMode}
              onCheckedChange={setEarbudToggleMode}
              aria-label="Earbud tap-to-talk"
            />
          </DropdownMenuItem>
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal leading-snug whitespace-normal">
            Tap once on earbuds to start talking, tap again to stop, or auto-stops after 30 seconds.
            Dedicated PTT buttons still use push-and-hold.
          </DropdownMenuLabel>
          {bluetooth?.isSupported && (
            <>
              <DropdownMenuItem
                disabled={bluetooth.isConnecting}
                onSelect={(event) => {
                  event.preventDefault();
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
                    {bluetooth.isConnecting ? "Pairing BLE button..." : "Pair BLE button (advanced)"}
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal leading-snug whitespace-normal">
                Most Bluetooth buttons work when paired in your phone&apos;s Bluetooth settings.
                Open Talk or Monitor and press the button — no in-app pairing needed.
              </DropdownMenuLabel>
              {bluetooth.error && (
                <DropdownMenuLabel className="text-xs text-destructive font-normal leading-snug whitespace-normal">
                  {bluetooth.error}
                </DropdownMenuLabel>
              )}
            </>
          )}
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setShowDeleteAccount(true)}
          >
            <UserX className="w-4 h-4" />
            Delete account
          </DropdownMenuItem>
          {isPlatformAdmin && (
            <DropdownMenuItem asChild>
              <a href={ADMIN_APP_URL}>
                <Shield className="w-4 h-4" />
                Admin dashboard
              </a>
            </DropdownMenuItem>
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
      <DeleteAccountDialog open={showDeleteAccount} onOpenChange={setShowDeleteAccount} />
    </>
  );
}
