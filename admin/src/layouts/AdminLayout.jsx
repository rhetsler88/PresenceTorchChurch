import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Users,
  Radio,
  Inbox,
  LogOut,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { getDisplayName } from "@/lib/userUtils";
import { WEB_APP_URL } from "@/lib/appLinks";
import { useBootstrapDatabase } from "@admin/hooks/useBootstrapDatabase";
import InitializeDatabaseBanner from "@admin/components/InitializeDatabaseBanner";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/organizations", icon: Building2, label: "Organizations" },
  { to: "/users", icon: Users, label: "Users" },
  { to: "/channels", icon: Radio, label: "Channels" },
  { to: "/access-requests", icon: Inbox, label: "Access Requests" },
];

export default function AdminLayout({ user }) {
  const { logout } = useAuth();
  const bootstrap = useBootstrapDatabase(user, { autoSeed: true });

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="p-5 border-b border-border">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Presence Torch
          </p>
          <h1 className="text-lg font-bold text-foreground mt-1">Admin Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {getDisplayName(user)}
            {user.role === "super_admin" ? " · Super Admin" : " · Org Admin"}
          </p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground"
            asChild
          >
            <a href={WEB_APP_URL}>
              <ExternalLink className="w-4 h-4" />
              Back to app
            </a>
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={() => logout(true)}
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <InitializeDatabaseBanner user={user} {...bootstrap} />
        <Outlet />
      </main>
    </div>
  );
}
