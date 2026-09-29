import React from "react";

export default function DirectorControls({ user, channels, onToggleChannel }) {
  const directedChannels = user.directed_channels || [];

  return (
    <div className="mt-2 pl-[52px]">
      <p className="text-[10px] text-muted-foreground mb-1.5 font-semibold uppercase tracking-wide">
        Assigned channels (member approvals)
      </p>
      <p className="text-[10px] text-muted-foreground/80 mb-1.5">
        Controls which channels this coordinator can approve or reject — not Monitor listen or PTT scope.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {channels.map(ch => {
          const assigned = directedChannels.includes(ch.id);
          return (
            <button
              key={ch.id}
              onClick={() => onToggleChannel(user, ch.id)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                assigned
                  ? "text-white shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
              style={assigned ? { backgroundColor: ch.color || "#f59e0b" } : {}}
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