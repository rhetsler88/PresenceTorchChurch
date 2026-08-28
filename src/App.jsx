import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { Capacitor } from '@capacitor/core';
import { isPwaInstalled } from '@/lib/pushDevice';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';

const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { normalizeOrganization } from '@/lib/userUtils';
import { auth } from '@/lib/firebase';
import AppLayout from './components/layout/AppLayout';
import Talk from './pages/Talk';
import Contacts from './pages/Contacts';
import Channels from './pages/Channels';
import Transcripts from './pages/Transcripts';
import Monitor from './pages/Monitor';
import Admin from './pages/Admin';
import AdminShell from './components/admin/AdminShell';
import Onboarding from './pages/Onboarding';
import Login from './pages/Login';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import AppLoadingScreen from '@/components/ui/AppLoadingScreen';

function AppRoutes() {
  return (
    <div className="w-full min-h-dvh flex flex-col">
      <Routes>
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/*" element={<AuthenticatedApp />} />
      </Routes>
    </div>
  );
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, user } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    const loadingMessage =
      auth.currentUser ? "Loading your account..." : "Connecting...";

    return <AppLoadingScreen message={loadingMessage} />;
  }

  if (authError) {
    if (authError.type === 'auth_required') {
      return <Login />;
    }
    return (
      <div className="page-adaptive bg-background dark safe-top safe-bottom">
        <div className="page-adaptive-inner flex items-center justify-center px-4 py-6">
          <div className="text-center max-w-sm w-full">
            <p className="text-sm text-destructive font-medium mb-2">Something went wrong</p>
            <p className="text-xs text-muted-foreground">{authError.message}</p>
          </div>
        </div>
      </div>
    );
  }

  if (user && (!user.onboarded || !normalizeOrganization(user.organization))) {
    return (
      <Routes>
        <Route path="/*" element={<Onboarding />} />
      </Routes>
    );
  }

  return (
    <div className="w-full min-h-dvh flex flex-col">
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Talk />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/channels" element={<Channels />} />
          <Route path="/transcripts" element={<Navigate to="/admin/logs" replace />} />
          <Route path="/monitor" element={<Monitor />} />
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<Admin />} />
            <Route path="logs" element={<Transcripts />} />
          </Route>
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </div>
  );
};

function App() {
  const showToasts = !isPwaInstalled();

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRoutes />
        </Router>
        {showToasts && <Toaster />}
        {showToasts && <SonnerToaster richColors closeButton />}
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
