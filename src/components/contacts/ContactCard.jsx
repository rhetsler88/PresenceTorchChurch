import React from "react";
import { Phone, MoreVertical, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export default function ContactCard({ contact, onDelete }) {
  const initials = (contact.name || "?").slice(0, 2).toUpperCase();
  const statusColor = {
    online: "bg-green-500",
    busy: "bg-amber-500",
    offline: "bg-muted-foreground/40",
  }[contact.status || "offline"];

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors rounded-xl">
      <div className="relative">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center"
          style={{ backgroundColor: (contact.avatar_color || "#6366f1") + "20" }}
        >
          <span
            className="text-sm font-bold"
            style={{ color: contact.avatar_color || "#6366f1" }}
          >
            {initials}
          </span>
        </div>
        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${statusColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{contact.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Phone className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{contact.phone_number}</span>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => onDelete?.(contact)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Remove Contact
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}