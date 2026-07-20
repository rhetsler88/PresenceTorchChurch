import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getDisplayName, getInitials } from "@/lib/userUtils";
import { getCodeDateKey } from "@/lib/dailyCode";

export default function ChannelMembersSheet({ channel, open, onOpenChange }) {
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.entities.User.list(),
    enabled: open,
  });

  const todayKey = getCodeDateKey();
  const memberIds = channel?.members || [];
  const members = users.filter((u) => {
    const isMember = memberIds.includes(u.id) || memberIds.includes(u.email);
    if (!isMember) return false;
    const bypassesCode = u.role === "admin" || u.role === "director";
    return bypassesCode || u.daily_code_verified_date === todayKey;
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-xs p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="text-base">
            {channel?.name || "Channel"} — Active Now
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            {members.length} member{members.length !== 1 ? "s" : ""} online today
          </p>
        </SheetHeader>
        <div className="overflow-auto py-1">
          {members.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 px-5 py-2.5"
            >
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-primary">
                  {getInitials(u)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {getDisplayName(u)}
                </p>
                {u.role && u.role !== "user" && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                    {u.role === "director" ? "Director/Lead" : u.role}
                  </span>
                )}
              </div>
            </div>
          ))}
          {members.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No members online
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}