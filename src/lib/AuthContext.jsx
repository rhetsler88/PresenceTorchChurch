import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from "react";
import { onAuthStateChanged, getRedirectResult } from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { doc, getDoc, setDoc, collection, query, where, limit, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { authApi } from "@/api/client";
import { initPushNotifications, teardownPushNotifications, refreshWebPushAfterInstall } from "@/lib/pushNotifications";
import { clearDailyCodeSession } from "@/lib/dailyCode";
import {
  clearOAuthRedirectPending,
  installCloseLogoutHandler,
  shouldLogoutAfterClose,
  isSessionExpired,
  recordLoginTime,
  clearLoginTime,
  getLoginTime,
  SESSION_MAX_MS,
} from "@/lib/logoutOnClose";
import { formatAuthError } from "@/api/client";
import { syncUserChannelMembership } from "@/lib/channelMembership";

const AuthContext = createContext(null);

async function refreshAuthCustomClaims(firebaseUser) {
  try {
    await setDoc(
      doc(db, "users", firebaseUser.uid),
      { claims_sync_at: new Date().toISOString() },
      { merge: true }
    );
    await new Promise((resolve) => setTimeout(resolve, 2500));
  } catch (err) {
    console.warn("[Auth] Claims sync touch failed:", err?.message || err);
  }
  await firebaseUser.getIdToken(true);
}

async function hydrateUserWithMembership(firebaseUser, currentUser) {
  try {
    const access = await authApi.syncMyChannelAccess();
    return {
      ...currentUser,
      email: currentUser.email || firebaseUser.email,
      role: access?.role || currentUser.role,
      member_of_channels: access?.channelIds?.length
        ? access.channelIds
        : currentUser.member_of_channels || [],
    };
  } catch (err) {
    console.warn("Server channel membership sync failed, falling back to client:", err);
    try {
      const channelIds = await syncUserChannelMembership(
        firebaseUser.uid,
        firebaseUser.email || currentUser.email
      );
      return {
        ...currentUser,
        member_of_channels: channelIds.length
          ? channelIds
          : currentUser.member_of_channels || [],
      };
    } catch (fallbackErr) {
      console.warn("Channel membership sync failed:", fallbackErr);
      return currentUser;
    }
  }
}

async function expireSession() {
  clearLoginTime();
  clearDailyCodeSession();
  await authApi.logout();
}

async function findOrphanProfileByEmail(email, excludeUid) {
  if (!email) return null;
  const snap = await getDocs(
    query(collection(db, "users"), where("email", "==", email), limit(5))
  );
  let best = null;
  let bestRank = roleRank("user");
  for (const candidate of snap.docs) {
    if (candidate.id === excludeUid) continue;
    const data = candidate.data() || {};
    const role = data.role || "user";
    const hasChannels = (data.member_of_channels || []).length > 0;
    const rank = roleRank(role) + (data.is_monitor ? 0.5 : 0) + (hasChannels ? 0.25 : 0);
    const isElevated = role !== "user" || data.is_monitor || hasChannels;
    if (!isElevated) continue;
    if (rank > bestRank) {
      bestRank = rank;
      best = { orphanId: candidate.id, ...data };
    }
  }
  return best;
}

function roleRank(role) {
  const ranks = { user: 0, monitor: 1, lead: 2, director: 3, admin: 4, super_admin: 5 };
  return ranks[role] ?? 0;
}

function buildMergedProfile(existing, orphanData, firebaseUser, displayName, firstName, lastName) {
  const existingRole = existing.role || "user";
  const orphanRole = orphanData.role || "user";
  const useOrphanRole = roleRank(orphanRole) > roleRank(existingRole);
  return {
    role: useOrphanRole ? orphanRole : existingRole,
    onboarded: orphanData.onboarded ?? existing.onboarded,
    directed_channels: orphanData.directed_channels?.length
      ? orphanData.directed_channels
      : (existing.directed_channels || []),
    broadcast_excluded_channels: orphanData.broadcast_excluded_channels?.length
      ? orphanData.broadcast_excluded_channels
      : (existing.broadcast_excluded_channels || []),
    member_of_channels: [
      ...new Set([
        ...(existing.member_of_channels || []),
        ...(orphanData.member_of_channels || []),
      ]),
    ],
    is_monitor: orphanData.is_monitor ?? existing.is_monitor ?? false,
    organization: orphanData.organization || existing.organization || "",
    receives_staff_alerts: orphanData.receives_staff_alerts ?? existing.receives_staff_alerts,
    pending_staff_alerts: orphanData.pending_staff_alerts ?? existing.pending_staff_alerts,
    email: firebaseUser.email,
    first_name: orphanData.first_name || existing.first_name || firstName,
    last_name: orphanData.last_name || existing.last_name || lastName,
    full_name: orphanData.full_name || existing.full_name || displayName,
  };
}

async function loadOrCreateUser(firebaseUser) {
  const userRef = doc(db, "users", firebaseUser.uid);
  const userDoc = await getDoc(userRef);
  const displayName = firebaseUser.displayName || "";
  const [firstName = "", ...rest] = displayName.split(" ");
  const lastName = rest.join(" ");

  if (!userDoc.exists()) {
    const orphan = await findOrphanProfileByEmail(firebaseUser.email, firebaseUser.uid);
    if (orphan) {
      console.warn("[Auth] Migrating elevated profile to users/{auth.uid}", {
        auth_uid: firebaseUser.uid,
        orphan_doc_id: orphan.orphanId,
        role: orphan.role,
      });
      const { orphanId: _orphanId, ...orphanData } = orphan;
      const profile = buildMergedProfile({}, orphanData, firebaseUser, displayName, firstName, lastName);
      await setDoc(userRef, profile);
      return { id: firebaseUser.uid, ...profile };
    }

    const profile = {
      email: firebaseUser.email,
      first_name: firstName,
      last_name: lastName,
      full_name: displayName,
      role: "user",
      onboarded: false,
      directed_channels: [],
      broadcast_excluded_channels: [],
      member_of_channels: [],
      is_monitor: false,
      pending_staff_alerts: false,
    };
    await setDoc(userRef, profile);
    return { id: firebaseUser.uid, ...profile };
  }

  const existing = userDoc.data() || {};
  const orphan = await findOrphanProfileByEmail(firebaseUser.email, firebaseUser.uid);
  if (orphan && orphan.orphanId !== firebaseUser.uid) {
    const { orphanId: _orphanId, ...orphanData } = orphan;
    const existingRole = existing.role || "user";
    const orphanRole = orphanData.role || "user";
    const shouldMerge =
      roleRank(orphanRole) > roleRank(existingRole)
      || (
        existingRole === "user"
        && !existing.is_monitor
        && !(existing.member_of_channels || []).length
      );
    if (shouldMerge) {
      console.warn("[Auth] Merging elevated profile into users/{auth.uid}", {
        auth_uid: firebaseUser.uid,
        orphan_doc_id: orphan.orphanId,
        role: orphanRole,
      });
      const merged = buildMergedProfile(existing, orphanData, firebaseUser, displayName, firstName, lastName);
      await setDoc(userRef, merged, { merge: true });
      return {
        id: firebaseUser.uid,
        email: firebaseUser.email,
        ...existing,
        ...merged,
      };
    }
  }

  // Backfill names when Firebase displayName is set after email registration
  if (displayName && !existing.full_name && !existing.first_name) {
    const updates = {
      first_name: firstName,
      last_name: lastName,
      full_name: displayName,
    };
    await setDoc(userRef, updates, { merge: true });
    return { id: firebaseUser.uid, email: firebaseUser.email, ...existing, ...updates };
  }

  return {
    id: firebaseUser.uid,
    email: firebaseUser.email,
    ...existing,
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState({
    id: "presence-torch-church",
  });
  const logoutRef = useRef(null);

  const applyAuthenticatedUser = (currentUser) => {
    setUser(currentUser);
    setIsAuthenticated(true);
    setAuthError(null);
    setIsLoadingAuth(false);
    setAuthChecked(true);
  };

  const applySignedOut = () => {
    setUser(null);
    setIsAuthenticated(false);
    setIsLoadingAuth(false);
    setAuthChecked(true);
    setAuthError({ type: "auth_required", message: "Authentication required" });
  };

  const checkUserAuth = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setIsLoadingAuth(true);
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        applySignedOut();
        return;
      }

      const loginTime = getLoginTime();
      if (loginTime) {
        if (isSessionExpired()) {
          await expireSession();
          applySignedOut();
          setAuthError({ type: "auth_required", message: "Session expired" });
          return;
        }
      } else {
        recordLoginTime();
      }

      const profile = await loadOrCreateUser(firebaseUser);
      const currentUser = await hydrateUserWithMembership(firebaseUser, profile);
      applyAuthenticatedUser(currentUser);
    } catch (error) {
      console.error("User auth check failed:", error);
      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);

      if (auth.currentUser) {
        setAuthError({
          type: "user_not_registered",
          message: "User not registered for this app",
        });
      } else {
        setAuthError({
          type: "auth_required",
          message: "Authentication required",
        });
      }
    }
  }, []);

  const refreshChannelMembership = useCallback(async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return [];
    try {
      const access = await authApi.syncMyChannelAccess();
      const channelIds = access?.channelIds || [];
      setUser((prev) =>
        prev
          ? {
              ...prev,
              member_of_channels: channelIds.length
                ? channelIds
                : prev.member_of_channels || [],
            }
          : prev
      );
      return channelIds;
    } catch (err) {
      console.warn("Server channel membership refresh failed, falling back to client:", err);
      const channelIds = await syncUserChannelMembership(
        firebaseUser.uid,
        firebaseUser.email
      );
      setUser((prev) =>
        prev
          ? {
              ...prev,
              member_of_channels: channelIds.length
                ? channelIds
                : prev.member_of_channels || [],
            }
          : prev
      );
      return channelIds;
    }
  }, []);

  const checkAppState = async () => {
    setIsLoadingPublicSettings(false);
    await checkUserAuth();
  };

  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;
    let pendingCloseLogout = shouldLogoutAfterClose();
    let authInitSettled = false;
    let authHandling = false;
    let listenerHasFired = false;

    const settleAuthInit = () => {
      authInitSettled = true;
    };

    const finishSignedOut = () => {
      applySignedOut();
      settleAuthInit();
    };

    const handleAuthUser = async (firebaseUser) => {
      if (cancelled || authHandling) return;
      authHandling = true;

      try {
        if (firebaseUser) {
          setIsLoadingAuth(true);
        }

        if (pendingCloseLogout) {
          pendingCloseLogout = false;
          if (firebaseUser) {
            await expireSession();
          } else {
            clearLoginTime();
            clearDailyCodeSession();
          }
          finishSignedOut();
          return;
        }

        if (!firebaseUser) {
          void teardownPushNotifications();
          finishSignedOut();
          return;
        }

        if (isSessionExpired()) {
          await expireSession();
          applySignedOut();
          setAuthError({ type: "auth_required", message: "Session expired" });
          return;
        }

        const currentUser = await hydrateUserWithMembership(
          firebaseUser,
          await loadOrCreateUser(firebaseUser)
        );

        if (!getLoginTime()) {
          recordLoginTime();
        }

        applyAuthenticatedUser(currentUser);
        void refreshAuthCustomClaims(firebaseUser);
        void initPushNotifications(firebaseUser.uid, currentUser).catch((err) => {
          console.error("Push notification init failed:", err);
        });
      } catch (error) {
        console.error("Auth state error:", error);
        setAuthError({ type: "unknown", message: error.message });
        setIsLoadingAuth(false);
        setAuthChecked(true);
      } finally {
        authHandling = false;
        if (!authInitSettled) settleAuthInit();
      }
    };

    const initAuth = async () => {
      setIsLoadingAuth(true);

      unsub = onAuthStateChanged(auth, (firebaseUser) => {
        listenerHasFired = true;
        void handleAuthUser(firebaseUser);
      });

      if (!Capacitor.isNativePlatform()) {
        try {
          const redirectResult = await getRedirectResult(auth);
          if (redirectResult?.user) {
            pendingCloseLogout = false;
            recordLoginTime();
          }
        } catch (error) {
          console.error("Redirect sign-in failed:", error);
          if (!cancelled && !authInitSettled) {
            setAuthError({
              type: "unknown",
              message: formatAuthError(error),
            });
            setIsLoadingAuth(false);
            setAuthChecked(true);
            settleAuthInit();
          }
        } finally {
          clearOAuthRedirectPending();
        }
      } else {
        clearOAuthRedirectPending();
      }

      // Fallback if Firebase never emits an initial auth state (shouldn't happen normally).
      if (!cancelled && !listenerHasFired && !authInitSettled) {
        try {
          await Promise.race([
            auth.authStateReady(),
            new Promise((resolve) => setTimeout(resolve, 8000)),
          ]);
        } catch (error) {
          console.warn("[Auth] authStateReady failed:", error);
        }
        if (!cancelled && !listenerHasFired && !authInitSettled) {
          await handleAuthUser(auth.currentUser);
        }
      }
    };

    initAuth();

    const timeoutId = window.setTimeout(() => {
      if (cancelled || authInitSettled || authHandling || listenerHasFired) return;
      console.warn("[Auth] Initialization timed out; showing sign-in.");
      finishSignedOut();
    }, 12000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      unsub();
    };
  }, []);

  useEffect(() => {
    const loginTime = getLoginTime();
    if (!loginTime || !isAuthenticated) return;

    const remaining = SESSION_MAX_MS - (Date.now() - loginTime);
    if (remaining <= 0) {
      expireSession().then(() => {
        applySignedOut();
        setAuthError({ type: "auth_required", message: "Session expired" });
      });
      return;
    }

    const timer = setTimeout(() => {
      expireSession().then(() => {
        applySignedOut();
        setAuthError({ type: "auth_required", message: "Session expired" });
      });
    }, remaining);

    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    return installCloseLogoutHandler();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id || Capacitor.isNativePlatform()) return undefined;

    const onAppInstalled = () => {
      void refreshWebPushAfterInstall(user.id, user).catch((err) => {
        console.warn("[Push] Failed to refresh web push after install:", err);
      });
    };

    window.addEventListener("appinstalled", onAppInstalled);
    return () => window.removeEventListener("appinstalled", onAppInstalled);
  }, [isAuthenticated, user]);

  const logout = async (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    clearLoginTime();
    clearDailyCodeSession();
    await authApi.logout(shouldRedirect ? window.location.href : undefined);
  };
  logoutRef.current = logout;

  const navigateToLogin = (captchaToken) => authApi.redirectToLogin(captchaToken);
  const signInWithEmail = (email, password, captchaToken) =>
    authApi.signInWithEmail(email, password, captchaToken);
  const signUpWithEmail = (email, password, captchaToken) =>
    authApi.signUpWithEmail(email, password, captchaToken);

  const registerWithEmail = async ({ email, password, firstName, lastName }) => {
    await authApi.registerWithEmail({ email, password, firstName, lastName });
    try {
      const currentUser = await authApi.me();
      applyAuthenticatedUser(currentUser);
    } catch (error) {
      console.error("Post-registration profile refresh failed:", error);
    }
  };

  const resetPassword = (email) => authApi.resetPassword(email);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        authChecked,
        logout,
        navigateToLogin,
        signInWithEmail,
        signUpWithEmail,
        registerWithEmail,
        resetPassword,
        checkUserAuth,
        checkAppState,
        refreshChannelMembership,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
