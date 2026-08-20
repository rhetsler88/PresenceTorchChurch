import React from "react";
import { Shield, Eye, User, ChevronDown, Crown, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DirectorControls from "@/components/admin/DirectorControls";
import MonitorBroadcastControls from "@/components/admin/MonitorBroadcastControls";
import { getInitials } from "@/lib/userUtils";

export const ROLE_CONFIG = {
  super_admin: { label: "Super Admin", color: "text-red-400", bg: "bg-red-500/10", icon: Shield },
  admin: { label: "Admin", color: "text-red-400", bg: "bg-red-500/10", icon: Shield },
  director: { label: "Director", color: "text-purple-400", bg: "bg-purple-500/10", icon: Shield },
  lead: { label: "Lead", color: "text-purple-400", bg: "bg-purple-500/10", icon: Crown },
  monitor: { label: "Monitor", color: "text-amber-400", bg: "bg-amber-500/10", icon: Eye },
  user: { label: "User", color: "text-muted-foreground", bg: "bg-muted", icon: User },
};

export default function UserRow({
  user,
  currentUser,
  onChangeRole,
  channels,
  onToggleChannel,
  onToggleBroadcastChannel,
  onToggleMonitor,
  onToggleStaffAlerts,
  canManageStaffAlerts = false,
  adminControls = true,
  assignableRoles,
  showMonitorToggle = true,
  showChannelAssignment = true,
}) {
  const cfg = ROLE_CONFIG[user.role || "user"];
  const Icon = cfg.icon;
  const isCurrentUser = user.id === currentUser?.id;
  const initials = getInitials(user);
  const isLeadUser = user.role === "lead";
  const isDirectorUser = user.role === "director";
  const hasAssignedChannels = isLeadUser || isDirectorUser;
  const isMonitor = user.role === "monitor" || user.is_monitor === true;
  const roleOptions = assignableRoles
    ? Object.entries(ROLE_CONFIG).filter(([role]) => assignableRoles.includes(role))
    : Object.entries(ROLE_CONFIG);

  return (
    <div className="px-4 py-3 hover:bg-muted/30 rounded-xl transition-colors overflow-hidden">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-primary">{initials}</span>
        </div>
        <div className="flex-1 min-w-0 basis-[calc(100%-3.25rem)] sm:basis-auto">
          <p className="text-sm font-semibold text-foreground truncate">
            {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.full_name || "—"}
            {isCurrentUser && (
              <span className="ml-1.5 text-[10px] text-muted-foreground">(you)</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground truncate capitalize">{user.role || "user"}</p>
        </div>

        <div className="flex items-center gap-2 ml-auto shrink-0">
        {adminControls && showMonitorToggle && (
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
        )}

        {canManageStaffAlerts && (
          <Button
            variant={user.receives_staff_alerts ? "default" : "outline"}
            size="sm"
            className={`h-8 px-2.5 ${
              user.receives_staff_alerts
                ? "bg-red-500 text-white hover:bg-red-600 border-red-500"
                : "text-muted-foreground"
            }`}
            onClick={() => onToggleStaffAlerts?.(user)}
            disabled={isCurrentUser}
            title="Staff alerts — any channel Code Red, even when signed out (native push)"
          >
            <Bell className="w-3.5 h-3.5" />
          </Button>
        )}

        {onChangeRole && (
          <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`gap-1.5 text-xs h-8 max-w-[9rem] sm:max-w-none ${cfg.color} border-border`}
              disabled={isCurrentUser}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{cfg.label}</span>
              <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {roleOptions.map(([role, { label, icon: RoleIcon, color }]) => (
              <DropdownMenuItem
                key={role}
                className={`gap-2 ${color} ${user.role === role ? "font-bold" : ""}`}
                onSelect={() => onChangeRole(user, role)}
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
        )}
        </div>
      </div>

      {/* Lead/director channel assignment */}
      {adminControls && showChannelAssignment && hasAssignedChannels && (
        <DirectorControls
          user={user}
          channels={channels}
          onToggleChannel={onToggleChannel}
        />
      )}

      {/* Monitor broadcast channel assignment */}
      {adminControls && isMonitor && (
        <MonitorBroadcastControls
          user={user}
          channels={channels}
          onToggleChannel={onToggleBroadcastChannel}
        />
      )}
    </div>
  );
}