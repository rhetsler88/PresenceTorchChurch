import React from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Radio, MessageSquare, FileText, Eye, Shield, Crown } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import DailyCodeGate from "@/components/dailycode/DailyCodeGate";
import UserMenu from "@/components/layout/UserMenu";
import { isPlatformAdmin, canAccessMonitorPage, isDirector, isLead } from "@/lib/userUtils";
import { BluetoothPTTProvider } from "@/components/ptt/BluetoothPTTContext";
import { PassiveMonitorProvider } from "@/components/monitor/PassiveMonitorProvider";
import { PassiveTalkListenProvider } from "@/components/ptt/PassiveTalkListenProvider";
import RedAlertBanner from "@/components/ptt/RedAlertBanner";
import PasswordRotationReminder from "@/components/auth/PasswordRotationReminder";
import GooglePasswordSetupPrompt from "@/components/auth/GooglePasswordSetupPrompt";
import useRedAlert from "@/hooks/useRedAlert";

export default function AppLayout() {
  const location = useLocation();
  const { user, checkUserAuth } = useAuth();
  const { alertChannel, dismiss: dismissAlert } = useRedAlert(user);

  const showMonitor = canAccessMonitorPage(user);
  const isAdmin = isPlatformAdmin(user);
  const isDirectorUser = isDirector(user);
  const isLeadUser = isLead(user);

  const navItems = [
    { path: "/", icon: Radio, label: "Talk" },
    { path: "/transcripts", icon: FileText, label: "Logs" },
    ...(showMonitor ? [{ path: "/monitor", icon: Eye, label: "Monitor" }] : []),
    ...(isAdmin || isDirectorUser
      ? [{ path: "/admin", icon: Shield, label: "Admin" }]
      : []),
    ...(isLeadUser && !isAdmin && !isDirectorUser
      ? [{ path: "/admin", icon: Crown, label: "Approve" }]
      : []),
    { path: "/channels", icon: MessageSquare, label: "Channels" },
  ];

  return (
    <div className="h-dvh bg-background flex flex-col safe-top">
      <BluetoothPTTProvider>
      <PassiveMonitorProvider user={user}>
      <PassiveTalkListenProvider user={user}>
      <DailyCodeGate user={user} onUserUpdate={checkUserAuth}>
      <RedAlertBanner channelName={alertChannel} onDismiss={dismissAlert} />
      <PasswordRotationReminder />
      <GooglePasswordSetupPrompt />
      <UserMenu />
      <div
        className="flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)" }}
      >
        <Outlet />
      </div>
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 safe-bottom">
        <div className="flex items-center justify-around max-w-2xl mx-auto px-1 py-1.5">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all duration-200 active:scale-95 ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
                <span className="text-[10px] font-semibold tracking-wide uppercase">
                  {label}
                </span>
                {isActive && (
                  <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-primary rounded-full" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
      </DailyCodeGate>
      </PassiveTalkListenProvider>
      </PassiveMonitorProvider>
      </BluetoothPTTProvider>
    </div>
  );
}
