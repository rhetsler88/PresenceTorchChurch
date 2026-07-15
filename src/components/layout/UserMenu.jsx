import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserCog, LogOut, Shield } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { getDisplayName, getInitials } from "@/lib/userUtils";
import { ADMIN_APP_URL } from "@/lib/appLinks";
import EditProfileDialog from "@/components/profile/EditProfileDialog";

export default function UserMenu() {
  const { user, logout } = useAuth();
  const [showEditProfile, setShowEditProfile] = useState(false);

  if (!user) return null;

  const displayName = getDisplayName(user);
  const initials = getInitials(user);
  const isPlatformAdmin = user.role === "super_admin" || user.role === "admin";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="fixed right-3 z-40 flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-card border border-border shadow-sm hover:border-primary/40 transition-colors active:scale-95"
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
    </>
  );
}
