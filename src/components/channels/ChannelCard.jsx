import React from "react";
import { Radio, Users, ChevronRight, Pencil, Shield, UserPlus, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ProtectionLevelControl from "@/components/monitor/ProtectionLevelControl";
import { PROTECTION_LEVELS } from "@/components/ptt/ProtectionLevelBadge";
import { getVisibleChannelMemberEntries } from "@/lib/userUtils";

export default function ChannelCard({
  channel,
  isActive,
  isPending,
  onOpenTalk,
  onRequestAccess,
  canRename,
  onRename,
  canManageProtection,
  protectionLevel,
  onProtectionChange,
}) {
  const memberCount = getVisibleChannelMemberEntries(channel).length;
  const protConfig = PROTECTION_LEVELS[protectionLevel] || PROTECTION_LEVELS.green;

  const channelInfo = (
    <>
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: (channel.color || "#f59e0b") + "18" }}
      >
        <Radio
          className="w-5 h-5"
          style={{ color: channel.color || "#f59e0b" }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${isActive ? "text-primary" : "text-foreground"}`}>
          {channel.name}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Users className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {memberCount} member{memberCount !== 1 ? "s" : ""}
          </span>
          {isPending && (
            <span className="text-[10px] font-semibold text-amber-500 ml-1">Pending</span>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div
      className={`w-full bg-card border rounded-2xl overflow-hidden transition-all duration-200 text-left ${
        isActive
          ? "border-primary/30 shadow-sm shadow-primary/5"
          : isPending
          ? "border-amber-500/20"
          : "border-border"
      }`}
    >
      <div className="px-4 py-3 flex items-center gap-3 border-b border-border">
        {isActive ? (
          <button
            type="button"
            onClick={() => onOpenTalk(channel)}
            className="flex items-center gap-3 flex-1 min-w-0 text-left"
          >
            {channelInfo}
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </button>
        ) : (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {channelInfo}
          </div>
        )}
        {canRename && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRename(channel);
            }}
            className="p-2 rounded-lg hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            title="Rename channel"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>
      {canManageProtection ? (
        <div onClick={(e) => e.stopPropagation()} className="px-4 py-2">
          <ProtectionLevelControl
            level={protectionLevel || "green"}
            onChange={onProtectionChange}
          />
        </div>
      ) : (
        <div className="px-4 py-2">
          <div className="flex items-center gap-3 px-1 py-1.5 rounded-xl border" style={{ backgroundColor: protConfig.bg, borderColor: protConfig.color + "40" }}>
            <Shield className="w-5 h-5 flex-shrink-0" style={{ color: protConfig.color }} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground leading-none">Force Protection</p>
              <p className="text-sm font-semibold leading-tight mt-0.5" style={{ color: protConfig.color }}>{protConfig.label} — {protConfig.desc}</p>
            </div>
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: protConfig.color }} />
          </div>
        </div>
      )}
      {!isActive && (
        <div className="px-4 pb-3 pt-1">
          {isPending ? (
            <Button variant="outline" size="sm" className="w-full gap-2" disabled>
              <Clock3 className="w-4 h-4" />
              Pending approval
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => onRequestAccess(channel)}
            >
              <UserPlus className="w-4 h-4" />
              Request access
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
