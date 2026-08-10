import React from "react";

export default function MonitorBroadcastControls({ user, channels, onToggleChannel }) {
  const excludedChannels = user.broadcast_excluded_channels || [];

  return (
    <div className="mt-2 pl-[52px]">
      <p className="text-[10px] text-muted-foreground mb-0.5 font-semibold uppercase tracking-wide">
        Default Broadcast Exclusions
      </p>
      <p className="text-[10px] text-muted-foreground/80 mb-1.5">
        Excluded channels start unchecked — monitors can still include them per broadcast
      </p>
      <div className="flex flex-wrap gap-1.5">
        {channels.map(ch => {
          const excluded = excludedChannels.includes(ch.id);
          return (
            <button
              key={ch.id}
              onClick={() => onToggleChannel(user, ch.id)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                excluded
                  ? "text-white shadow-sm line-through opacity-80"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
              style={excluded ? { backgroundColor: ch.color || "#f59e0b" } : {}}
            >
              {ch.name}
            </button>
          );
        })}
        {channels.length === 0 && (
          <p className="text-[10px] text-muted-foreground">No channels available</p>
        )}
      </div>
    </div>
  );
}
