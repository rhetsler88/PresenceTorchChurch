import React from "react";
import { Shield, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PROTECTION_LEVELS } from "@/components/ptt/ProtectionLevelBadge";

export default function ProtectionLevelControl({ level = "green", onChange }) {
  const config = PROTECTION_LEVELS[level] || PROTECTION_LEVELS.green;
  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg border"
      style={{ backgroundColor: config.bg, borderColor: config.color + "40" }}
    >
      <Shield className="w-4 h-4 flex-shrink-0" style={{ color: config.color }} />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-none">
          Protection
        </p>
        <p className="text-xs font-semibold leading-tight" style={{ color: config.color }}>
          {config.label}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-1 rounded hover:bg-black/10 flex-shrink-0">
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {Object.entries(PROTECTION_LEVELS).map(([key, cfg]) => (
            <DropdownMenuItem key={key} onClick={() => onChange(key)} className="gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cfg.color }} />
              <span>{cfg.label} — {cfg.desc}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}