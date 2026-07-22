import React, { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Users,
  Radio,
  Inbox,
  LogOut,
  Database,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/lib/AuthContext";
import { getDisplayName } from "@/lib/userUtils";
import { useBootstrapDatabase } from "@admin/hooks/useBootstrapDatabase";
import InitializeDatabaseBanner from "@admin/components/InitializeDatabaseBanner";
import BackToAppLink from "@admin/components/BackToAppLink";
import AppLogo from "@/components/branding/AppLogo";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/organizations", icon: Building2, label: "Organizations" },
  { to: "/users", icon: Users, label: "Users" },
  { to: "/channels", icon: Radio, label: "Channels" },
  { to: "/access-requests", icon: Inbox, label: "Access Requests" },
];

function SidebarPanel({ user, showInitialize, bootstrap, onNavigate }) {
  const { logout } = useAuth();

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-3 mb-3">
          <AppLogo className="w-10 h-10" />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Presence Torch
            </p>
            <h1 className="text-lg font-bold text-foreground leading-tight">Admin Dashboard</h1>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1 truncate">
          {getDisplayName(user)}
          {user.role === "super_admin" ? " · Super Admin" : " · Org Admin"}
        </p>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {showInitialize && (
          <button
            type="button"
            onClick={() => bootstrap.seedMutation.mutate()}
            disabled={bootstrap.seedMutation.isPending}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors mb-2"
          >
            <Database className="w-4 h-4" />
            {bootstrap.seedMutation.isPending ? "Initializing..." : "Initialize database"}
          </button>
        )}
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-border space-y-1 mt-auto">
        <BackToAppLink
          variant="ghost"
          className="w-full justify-start text-muted-foreground font-normal"
        />
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={() => logout(true)}
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}

export default function AdminLayout({ user }) {
  const bootstrap = useBootstrapDatabase(user, { autoSeed: true });
  const isSuperAdmin = user?.role === "super_admin";
  const showInitialize =
    isSuperAdmin &&
    !bootstrap.channelsLoading &&
    !bootstrap.orgsLoading &&
    bootstrap.needsSeed;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <div className="h-dvh bg-background flex overflow-hidden safe-top">
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border flex-col">
        <SidebarPanel user={user} showInitialize={showInitialize} bootstrap={bootstrap} />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SidebarPanel
            user={user}
            showInitialize={showInitialize}
            bootstrap={bootstrap}
            onNavigate={closeMobileNav}
          />
        </SheetContent>
      </Sheet>

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-card/50 md:hidden shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <BackToAppLink variant="outline" className="text-xs h-8" />
        </div>
        <InitializeDatabaseBanner user={user} {...bootstrap} showInitialize={showInitialize} />
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
