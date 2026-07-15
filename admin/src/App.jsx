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
import { Shield } from "lucide-react";

function canAccessAdmin(user) {
  return user?.role === "super_admin" || user?.role === "admin";
}

function AdminAppRoutes() {
  const { user, isLoadingAuth, authError, navigateToLogin } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || authError?.type === "auth_required" || !canAccessAdmin(user)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center">
          <Shield className="w-12 h-12 text-primary mx-auto mb-4" />
          <h1 className="text-xl font-bold text-foreground mb-2">Admin access required</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Sign in with a super admin or organization admin account to use this dashboard.
          </p>
          <Button onClick={() => navigateToLogin()}>Sign in with Google</Button>
        </div>
      </div>
    );
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
