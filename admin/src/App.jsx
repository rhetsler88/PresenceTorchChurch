import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { queryClientInstance } from "@/lib/query-client";
import AdminLayout from "@admin/layouts/AdminLayout";
import Dashboard from "@admin/pages/Dashboard";
import Organizations from "@admin/pages/Organizations";
import Users from "@admin/pages/Users";
import Channels from "@admin/pages/Channels";
import AccessRequests from "@admin/pages/AccessRequests";
import { Button } from "@/components/ui/button";
import BackToAppLink from "@admin/components/BackToAppLink";
import AppLogo from "@/components/branding/AppLogo";
import AuthSignInPanel from "@/components/auth/AuthSignInPanel";
import { getDisplayName } from "@/lib/userUtils";

function canAccessAdmin(user) {
  return user?.role === "super_admin" || user?.role === "admin";
}

function AdminGate({ user, authError, logout }) {
  const needsSignIn = !user || authError?.type === "auth_required";

  if (needsSignIn) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background p-4 sm:p-6 safe-top">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 sm:p-8">
          <div className="text-center mb-6">
            <AppLogo className="w-16 h-16 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-foreground mb-2">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Sign in with a super admin or organization admin account to manage organizations,
              users, and channels.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <AuthSignInPanel />
            <BackToAppLink className="w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background p-4 sm:p-6 safe-top">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 sm:p-8 text-center">
        <AppLogo className="w-16 h-16 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-foreground mb-2">Admin access required</h1>
        <p className="text-sm text-muted-foreground mb-2">
          Signed in as{" "}
          <span className="font-medium text-foreground">{getDisplayName(user)}</span>
          {user.email ? ` (${user.email})` : ""}.
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          Your account role is{" "}
          <span className="font-mono text-foreground">{user.role || "user"}</span>. Only{" "}
          <span className="font-mono text-foreground">admin</span> and{" "}
          <span className="font-mono text-foreground">super_admin</span> can use this dashboard.
        </p>
        <p className="text-xs text-muted-foreground mb-6 text-left bg-muted/40 rounded-lg p-3">
          First-time setup: open Firebase Console → Firestore →{" "}
          <span className="font-mono">users/{user.id}</span> and set{" "}
          <span className="font-mono">role</span> to <span className="font-mono">super_admin</span>
          , then refresh this page. You will then see <strong>Initialize database</strong> to create
          Safety Team and PH Kids channels.
        </p>
        <div className="flex flex-col gap-3">
          <Button variant="outline" onClick={() => window.location.reload()}>
            Refresh after role update
          </Button>
          <BackToAppLink className="w-full" />
          <Button variant="ghost" onClick={() => logout(true)}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}

function AdminAppRoutes() {
  const { user, isLoadingAuth, authError, logout } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background safe-top">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!canAccessAdmin(user)) {
    return <AdminGate user={user} authError={authError} logout={logout} />;
  }

  return (
    <Routes>
      <Route element={<AdminLayout user={user} />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/organizations" element={<Organizations />} />
        <Route path="/users" element={<Users />} />
        <Route path="/channels" element={<Channels />} />
        <Route path="/access-requests" element={<AccessRequests />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <BrowserRouter>
          <AdminAppRoutes />
        </BrowserRouter>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}
