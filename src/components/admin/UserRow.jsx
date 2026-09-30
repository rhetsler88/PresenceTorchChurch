import React from "react";
import { Shield, Eye, User, ChevronDown, Crown, Bell, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DirectorControls from "@/components/admin/DirectorControls";
import MonitorBroadcastControls from "@/components/admin/MonitorBroadcastControls";
import { getInitials, isDedicatedMonitorUser } from "@/lib/userUtils";
import { useCompactLayout } from "@/hooks/useViewportWidth";

export const ROLE_CONFIG = {
  super_admin: { label: "Super Admin", color: "text-destructive", bg: "bg-destructive/10", icon: Shield },
  admin: { label: "Admin", color: "text-destructive", bg: "bg-destructive/10", icon: Shield },
  director: { label: "Team Lead", color: "text-purple-400", bg: "bg-purple-500/10", icon: Shield },
  lead: { label: "Coordinator", color: "text-purple-400", bg: "bg-purple-500/10", icon: Crown },
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
  onDeleteUser,
}) {
  const cfg = ROLE_CONFIG[user.role || "user"];
  const Icon = cfg.icon;
  const isCurrentUser = user.id === currentUser?.id;
  const initials = getInitials(user);
  const isLeadUser = user.role === "lead";
  const isDirectorUser = user.role === "director";
  const hasAssignedChannels = isLeadUser || isDirectorUser;
  const isMonitor = isDedicatedMonitorUser(user);
  const roleOptions = assignableRoles
    ? Object.entries(ROLE_CONFIG).filter(([role]) => assignableRoles.includes(role))
    : Object.entries(ROLE_CONFIG);
  const compact = useCompactLayout();

  return (
    <div className="px-2 xs:px-4 py-3 hover:bg-muted/30 rounded-xl transition-colors">
      <div className={`flex gap-2 xs:gap-3 ${compact ? "flex-col" : "items-center flex-wrap"}`}>
        <div className="flex items-center gap-2 xs:gap-3 min-w-0 flex-1">
        <div className="w-9 h-9 xs:w-10 xs:h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-primary">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.full_name || "—"}
            {isCurrentUser && (
              <span className="ml-1.5 text-[10px] text-muted-foreground">(you)</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground truncate">{cfg.label}</p>
        </div>
        </div>

        <div className={`flex items-center gap-1.5 xs:gap-2 shrink-0 ${compact ? "w-full pl-11" : "ml-auto"}`}>
        {adminControls && showMonitorToggle && (
          <Button
            variant={isMonitor ? "default" : "outline"}
            size="sm"
            className={`h-8 px-2.5 ${
              isMonitor
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
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 border-destructive"
                : "text-muted-foreground"
            }`}
            onClick={() => onToggleStaffAlerts?.(user)}
            disabled={isCurrentUser}
            title="Staff alerts — any channel Code Red, even when signed out (native push)"
          >
            <Bell className="w-3.5 h-3.5" />
          </Button>
        )}

        {onDeleteUser && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => onDeleteUser(user)}
            disabled={isCurrentUser}
            title="Delete user account"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}

        {onChangeRole && (
          <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`gap-1 text-xs h-8 min-w-0 ${compact ? "flex-1 max-w-none" : "max-w-[9rem] sm:max-w-none"} ${cfg.color} border-border`}
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