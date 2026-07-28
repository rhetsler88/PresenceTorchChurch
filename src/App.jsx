import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { Capacitor } from '@capacitor/core';
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom';

const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { auth } from '@/lib/firebase';
import AppLayout from './components/layout/AppLayout';
import Talk from './pages/Talk';
import Contacts from './pages/Contacts';
import Channels from './pages/Channels';
import Transcripts from './pages/Transcripts';
import Monitor from './pages/Monitor';
import Admin from './pages/Admin';
import Onboarding from './pages/Onboarding';
import Login from './pages/Login';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/*" element={<AuthenticatedApp />} />
    </Routes>
  );
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, user } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    const loadingMessage =
      auth.currentUser ? "Loading your account..." : "Connecting...";

    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background dark">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground font-medium">{loadingMessage}</span>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'auth_required') {
      return <Login />;
    }
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background dark p-4">
        <div className="text-center max-w-sm">
          <p className="text-sm text-destructive font-medium mb-2">Something went wrong</p>
          <p className="text-xs text-muted-foreground">{authError.message}</p>
        </div>
      </div>
    );
  }

  if (user && !user.onboarded) {
    return (
      <Routes>
        <Route path="/*" element={<Onboarding />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Talk />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/channels" element={<Channels />} />
        <Route path="/transcripts" element={<Transcripts />} />
        <Route path="/monitor" element={<Monitor />} />
        <Route path="/admin" element={<Admin />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRoutes />
        </Router>
        <Toaster />
        <SonnerToaster richColors closeButton />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
