import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import SpeakerVolumeControl from "@/components/ptt/SpeakerVolumeControl";
import { useAuth } from "@/lib/AuthContext";
import { getDisplayName, getInitials } from "@/lib/userUtils";

export default function ChannelMembersSheet({ channel, onlineMembers = [], open, onOpenChange }) {
  const { user: currentUser } = useAuth();

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.entities.User.list(),
    enabled: open,
  });

  const members = useMemo(() => {
    const byId = new Map(users.map((user) => [user.id, user]));
    return onlineMembers.map((presence) => {
      const profile = byId.get(presence.userId);
      return profile || {
        id: presence.userId,
        displayName: presence.displayName,
      };
    });
  }, [onlineMembers, users]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-xs p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="text-base">
            {channel?.name || "Channel"} — Online Now
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            {members.length} user{members.length !== 1 ? "s" : ""} on this channel
          </p>
          {members.length > 0 && (
            <p className="text-[11px] text-muted-foreground/80">
              Tap a name to adjust how you hear them on this device.
            </p>
          )}
        </SheetHeader>
        <div className="overflow-auto py-1">
          {members.map((u) => {
            const name = u.displayName || getDisplayName(u);
            const isSelf = u.id === currentUser?.id;

            return (
              <div
                key={u.id}
                className="flex items-center gap-3 px-5 py-2.5"
              >
                <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-primary">
                    {getInitials(u)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  {isSelf ? (
                    <p className="text-sm font-semibold text-foreground truncate">{name}</p>
                  ) : (
                    <SpeakerVolumeControl
                      userId={u.id}
                      displayName={name}
                      variant="name"
                      className="w-full"
                    />
                  )}
                  {u.role && u.role !== "user" && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                      {u.role === "lead" ? "Lead" : u.role === "director" ? "Director" : u.role}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {members.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No users online on this channel
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
