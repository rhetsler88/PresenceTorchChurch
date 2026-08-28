import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Shield, Crown, FileText } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { isPlatformAdmin, isDirector, isLead } from "@/lib/userUtils";

function AdminTab({ to, end, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
          isActive
            ? "bg-background text-foreground shadow"
            : "text-muted-foreground hover:text-foreground"
        }`
      }
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </NavLink>
  );
}

export default function AdminShell() {
  const { user: currentUser } = useAuth();

  if (!currentUser) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isAdmin = isPlatformAdmin(currentUser);
  const isDirectorUser = isDirector(currentUser);
  const isLeadUser = isLead(currentUser);

  if (!isAdmin && !isDirectorUser && !isLeadUser) {
    return (
      <div className="page-adaptive safe-top safe-bottom">
        <div className="page-adaptive-inner flex items-center justify-center px-6 py-6">
          <div className="text-center max-w-sm w-full">
            <Shield className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground mb-1">Admin access required</p>
            <p className="text-xs text-muted-foreground">
              Your role is <span className="font-mono">{currentUser.role || "user"}</span>. Ask a platform admin to set your Firestore{" "}
              <span className="font-mono">users/{currentUser.id}.role</span> to{" "}
              <span className="font-mono">admin</span> or <span className="font-mono">super_admin</span>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const primaryLabel = isAdmin
    ? "Users"
    : isDirectorUser
      ? "Channels"
      : "Approvals";
  const PrimaryIcon = isLeadUser && !isAdmin && !isDirectorUser ? Crown : Shield;

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      <div className="px-4 pt-4 pb-3 sm:px-5 sm:pt-6 max-sm:pr-12 sm:pr-48">
        <nav
          className="inline-flex h-10 w-full max-w-md items-center rounded-lg bg-muted p-1 text-muted-foreground"
          aria-label="Admin sections"
        >
          <AdminTab to="/admin" end icon={PrimaryIcon} label={primaryLabel} />
          <AdminTab to="/admin/logs" icon={FileText} label="Logs" />
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
