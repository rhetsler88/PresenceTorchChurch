import React from "react";
import { Shield, Eye, User, ChevronDown, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DirectorControls from "@/components/admin/DirectorControls";

export const ROLE_CONFIG = {
  admin: { label: "Admin", color: "text-red-400", bg: "bg-red-500/10", icon: Shield },
  director: { label: "Director/Lead", color: "text-purple-400", bg: "bg-purple-500/10", icon: Crown },
  monitor: { label: "Monitor", color: "text-amber-400", bg: "bg-amber-500/10", icon: Eye },
  user: { label: "User", color: "text-muted-foreground", bg: "bg-muted", icon: User },
};

export default function UserRow({ user, currentUser, onChangeRole, channels, onToggleChannel, onToggleMonitor }) {
  const cfg = ROLE_CONFIG[user.role || "user"];
  const Icon = cfg.icon;
  const isCurrentUser = user.id === currentUser?.id;
  const initials = (user.full_name || user.first_name || user.email || "?").slice(0, 2).toUpperCase();
  const isDirector = user.role === "director";

  return (
    <div className="px-4 py-3 hover:bg-muted/30 rounded-xl transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-sm font-bold text-primary">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.full_name || "—"}
            {isCurrentUser && (
              <span className="ml-1.5 text-[10px] text-muted-foreground">(you)</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground truncate capitalize">{user.role || "user"}</p>
        </div>

        {/* Monitor toggle (separate from role) */}
        <Button
          variant={user.is_monitor ? "default" : "outline"}
          size="sm"
          className={`h-8 px-2.5 ${
            user.is_monitor
              ? "bg-amber-500 text-white hover:bg-amber-600 border-amber-500"
              : "text-muted-foreground"
          }`}
          onClick={() => onToggleMonitor(user)}
          disabled={isCurrentUser}
          title="Toggle monitoring rights"
        >
          <Eye className="w-3.5 h-3.5" />
        </Button>

        {/* Role dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`gap-1.5 text-xs h-8 ${cfg.color} border-border`}
              disabled={isCurrentUser}
            >
              <Icon className="w-3.5 h-3.5" />
              {cfg.label}
              <ChevronDown className="w-3 h-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {Object.entries(ROLE_CONFIG).map(([role, { label, icon: RoleIcon, color }]) => (
              <DropdownMenuItem
                key={role}
                className={`gap-2 ${color} ${user.role === role ? "font-bold" : ""}`}
                onClick={() => onChangeRole(user, role)}
              >
                <RoleIcon className="w-3.5 h-3.5" />
                {label}
                {user.role === role && (
                  <span className="ml-auto text-[10px] opacity-60">current</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Director channel assignment */}
      {isDirector && (
        <DirectorControls
          user={user}
          channels={channels}
          onToggleChannel={onToggleChannel}
        />
      )}
    </div>
  );
}