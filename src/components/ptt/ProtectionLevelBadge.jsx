import React from "react";
import { Shield } from "lucide-react";

export const PROTECTION_LEVELS = {
  blue: { label: "Blue", color: "#3b82f6", bg: "#3b82f620", desc: "All Clear" },
  green: { label: "Green", color: "#22c55e", bg: "#22c55e20", desc: "Safe" },
  yellow: { label: "Yellow", color: "#eab308", bg: "#eab30820", desc: "Caution" },
  red: { label: "Red", color: "#ef4444", bg: "#ef444420", desc: "Danger" },
};

export default function ProtectionLevelBadge({ level = "green" }) {
  const config = PROTECTION_LEVELS[level] || PROTECTION_LEVELS.green;
  return (
    <div
      className="mx-4 mt-3 flex items-center gap-3 px-4 py-3 rounded-xl border"
      style={{ backgroundColor: config.bg, borderColor: config.color + "40" }}
    >
      <Shield className="w-5 h-5 flex-shrink-0" style={{ color: config.color }} />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground leading-none">
          Protection Level
        </p>
        <p className="text-sm font-semibold leading-tight mt-0.5" style={{ color: config.color }}>
          {config.label} — {config.desc}
        </p>
      </div>
      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: config.color }} />
    </div>
  );
}