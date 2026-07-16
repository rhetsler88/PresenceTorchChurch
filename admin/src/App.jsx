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
import { Input } from "@/components/ui/input";
import { Shield } from "lucide-react";
import BackToAppLink from "@admin/components/BackToAppLink";
import { getDisplayName } from "@/lib/userUtils";
import { formatAuthError } from "@/api/client";

function canAccessAdmin(user) {
  return user?.role === "super_admin" || user?.role === "admin";
}

function AdminGate({
  user,
  authError,
  navigateToLogin,
  signInWithEmail,
  logout,
}) {
  const needsSignIn = !user || authError?.type === "auth_required";
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  const handleGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      await navigateToLogin();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleEmail = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithEmail(email.trim(), password);
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  if (needsSignIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8">
          <div className="text-center mb-6">
            <Shield className="w-12 h-12 text-primary mx-auto mb-4" />
            <h1 className="text-xl font-bold text-foreground mb-2">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Sign in with a super admin or organization admin account to manage organizations,
              users, and channels.
            </p>
          </div>

          {error && <p className="text-sm text-destructive text-center mb-4">{error}</p>}

          <form onSubmit={handleEmail} className="space-y-3 mb-4">
            <Input
              type="email"
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              required
            />
            <Button className="w-full" type="submit" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button variant="outline" onClick={handleGoogle} disabled={busy}>
              Continue with Google
            </Button>
            <BackToAppLink className="w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center">
        <Shield className="w-12 h-12 text-primary mx-auto mb-4" />
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
  const { user, isLoadingAuth, authError, navigateToLogin, signInWithEmail, logout } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!canAccessAdmin(user)) {
    return (
      <AdminGate
        user={user}
        authError={authError}
        navigateToLogin={navigateToLogin}
        signInWithEmail={signInWithEmail}
        logout={logout}
      />
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
