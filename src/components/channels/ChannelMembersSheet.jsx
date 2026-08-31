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

function OnlineAvatar({ user, isSelf }) {
  return (
    <div className="relative w-9 h-9 shrink-0 isolate">
      <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
        <span className="text-xs font-bold text-primary leading-none">
          {getInitials(user)}
        </span>
      </div>
      <span
        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${
          isSelf ? "bg-primary" : "bg-green-500"
        }`}
        aria-hidden
      />
    </div>
  );
}

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
      <SheetContent
        side="bottom"
        className="flex flex-col gap-0 p-0 w-full max-w-lg mx-auto max-h-[min(85dvh,28rem)] rounded-t-2xl border-t"
      >
        <SheetHeader className="shrink-0 space-y-1 px-5 pt-4 pb-3 pr-12 text-left border-b border-border">
          <SheetTitle className="text-base leading-snug pr-2">
            {channel?.name || "Channel"} — Online Now
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            {members.length} user{members.length !== 1 ? "s" : ""} on this channel
          </p>
          {members.length > 0 && (
            <p className="text-[11px] text-muted-foreground/80 leading-snug">
              Tap someone&apos;s name to adjust how you hear them on this device.
            </p>
          )}
        </SheetHeader>

        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-1"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
        >
          {members.map((u) => {
            const name = u.displayName || getDisplayName(u);
            const isSelf = u.id === currentUser?.id;

            return (
              <div
                key={u.id}
                className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-x-3 px-5 py-2.5 hover:bg-muted/40 transition-colors"
              >
                <OnlineAvatar user={u} isSelf={isSelf} />
                <div className="min-w-0 overflow-hidden">
                  {isSelf ? (
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {name}
                        <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          You
                        </span>
                      </p>
                    </div>
                  ) : (
                    <SpeakerVolumeControl
                      userId={u.id}
                      displayName={name}
                      variant="name"
                      className="w-full"
                    />
                  )}
                  {u.role && u.role !== "user" && (
                    <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-primary truncate">
                      {u.role === "lead" ? "Lead" : u.role === "director" ? "Director" : u.role}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {members.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8 px-5">
              No users online on this channel
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
