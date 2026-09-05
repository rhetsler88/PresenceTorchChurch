import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from "react";
import { onAuthStateChanged, getRedirectResult } from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { authApi, OAUTH_PROVIDER_IDS } from "@/api/client";
import { initPushNotifications, teardownPushNotifications, refreshWebPushAfterInstall } from "@/lib/pushNotifications";
import { stopAllBackgroundAudio } from "@/lib/backgroundAudio";
import { clearDailyCodeSession } from "@/lib/dailyCode";
import {
  clearOAuthRedirectPending,
  clearNativeGoogleSignInPending,
  clearBackgroundPending,
  ensureIdleLogoutWatch,
  installCloseLogoutHandler,
  shouldLogoutAfterClose,
  isSessionExpired,
  recordLoginTime,
  clearLoginTime,
  getLoginTime,
  SESSION_MAX_MS,
  isGoogleSignInRedirectPending,
  isNativeGoogleSignInPending,
  registerImmediateLogoutBridge,
  unregisterImmediateLogoutBridge,
  IMMEDIATE_LOGOUT_EVENT,
  isImmediateLogoutInFlight,
} from "@/lib/logoutOnClose";
import { clearLastAppRoute } from "@/lib/lastAppRoute";
import { clearPasswordLoginSession } from "@/lib/passwordRotation";
import { formatAuthError } from "@/api/client";
import { syncUserChannelMembership } from "@/lib/channelMembership";
import { consumeNativeForceLogoutPending, syncNativeActiveSession } from "@/lib/sessionGuardNative";
import { clearPresence, stopPresenceSession } from "@/lib/presence";

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
      directed_channels: access?.directed_channels?.length
        ? access.directed_channels
        : currentUser.directed_channels || [],
      member_of_channels: access?.channelIds?.length
        ? access.channelIds
        : access?.member_of_channels?.length
          ? access.member_of_channels
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
  clearPasswordLoginSession();
  await stopPresenceSession();
  await authApi.logout();
}

function isFirestorePermissionError(error) {
  return (
    error?.code === "permission-denied"
    || /missing or insufficient permissions/i.test(error?.message || "")
  );
}

async function clearStaleAuthSession() {
  try {
    await expireSession();
  } catch (err) {
    console.warn("Failed to clear stale auth session:", err?.message || err);
  }
}

function buildNewUserProfile(firebaseUser, displayName, firstName, lastName) {
  return {
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
}

async function ensureFirestoreAuth(firebaseUser, { forceRefresh = false } = {}) {
  await auth.authStateReady();
  await firebaseUser.getIdToken(forceRefresh);
}

async function loadOrCreateUserOnce(firebaseUser) {
  const userRef = doc(db, "users", firebaseUser.uid);
  const userDoc = await getDoc(userRef);
  const displayName = firebaseUser.displayName || "";
  const [firstName = "", ...rest] = displayName.split(" ");
  const lastName = rest.join(" ");

  if (!userDoc.exists()) {
    const profile = buildNewUserProfile(firebaseUser, displayName, firstName, lastName);
    await setDoc(userRef, profile);
    return { id: firebaseUser.uid, ...profile };
  }

  const existing = userDoc.data() || {};

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

  const authEmail = firebaseUser.email?.trim().toLowerCase() || "";
  if (authEmail && !existing.email?.trim()) {
    await setDoc(userRef, { email: authEmail }, { merge: true });
    return { id: firebaseUser.uid, ...existing, email: authEmail };
  }

  return {
    id: firebaseUser.uid,
    ...existing,
    email: existing.email?.trim() || authEmail,
  };
}

async function loadOrCreateUser(firebaseUser) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await ensureFirestoreAuth(firebaseUser, { forceRefresh: attempt > 0 });
      return await loadOrCreateUserOnce(firebaseUser);
    } catch (err) {
      lastErr = err;
      const retryable = err?.code === "permission-denied";
      if (!retryable || attempt >= 3) throw err;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw lastErr;
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
  const manualLogoutRef = useRef(false);

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
              role: access?.role || prev.role,
              directed_channels: access?.directed_channels?.length
                ? access.directed_channels
                : prev.directed_channels || [],
              member_of_channels: channelIds.length
                ? channelIds
                : access?.member_of_channels?.length
                  ? access.member_of_channels
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
    let pendingAuthUser = undefined;
    let hasPendingAuthUser = false;

    const settleAuthInit = () => {
      authInitSettled = true;
    };

    const finishSignedOut = () => {
      applySignedOut();
      settleAuthInit();
    };

    const handleAuthUser = async (firebaseUser) => {
      if (cancelled) return;
      if (authHandling) {
        pendingAuthUser = firebaseUser;
        hasPendingAuthUser = true;
        return;
      }
      if (manualLogoutRef.current || isImmediateLogoutInFlight()) {
        if (!firebaseUser) {
          void teardownPushNotifications();
          finishSignedOut();
        }
        return;
      }
      authHandling = true;

      try {
        if (firebaseUser) {
          setIsLoadingAuth(true);
        }

        if (pendingCloseLogout && !isGoogleSignInRedirectPending()) {
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
        } else {
          ensureIdleLogoutWatch();
          void syncNativeActiveSession(true).catch(() => {});
        }

        applyAuthenticatedUser(currentUser);
        void refreshAuthCustomClaims(firebaseUser);
        void initPushNotifications(firebaseUser.uid, currentUser).catch((err) => {
          console.error("Push notification init failed:", err);
          clearNativeGoogleSignInPending();
        });
      } catch (error) {
        console.error("Auth state error:", error);
        clearNativeGoogleSignInPending();
        if (isFirestorePermissionError(error)) {
          await clearStaleAuthSession();
          finishSignedOut();
          return;
        }
        setAuthError({ type: "unknown", message: formatAuthError(error) });
        setUser(null);
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
        setAuthChecked(true);
      } finally {
        authHandling = false;
        if (!authInitSettled) settleAuthInit();
        if (hasPendingAuthUser) {
          hasPendingAuthUser = false;
          const nextUser = pendingAuthUser;
          pendingAuthUser = undefined;
          void handleAuthUser(nextUser);
        }
      }
    };

    const initAuth = async () => {
      setIsLoadingAuth(true);

      if (Capacitor.isNativePlatform()) {
        if (await consumeNativeForceLogoutPending()) {
          pendingCloseLogout = true;
        }
        clearOAuthRedirectPending();
      } else {
        try {
          const redirectResult = await getRedirectResult(auth);
          if (redirectResult?.user) {
            pendingCloseLogout = false;
            recordLoginTime();
          }
        } catch (error) {
          console.error("Redirect sign-in failed:", error);
          if (!cancelled && !authInitSettled) {
            if (isFirestorePermissionError(error)) {
              await clearStaleAuthSession();
              finishSignedOut();
            } else {
              setAuthError({
                type: "unknown",
                message: formatAuthError(error),
              });
              setIsLoadingAuth(false);
              setAuthChecked(true);
              settleAuthInit();
            }
          }
        } finally {
          clearOAuthRedirectPending();
        }
      }

      unsub = onAuthStateChanged(auth, (firebaseUser) => {
        listenerHasFired = true;
        void handleAuthUser(firebaseUser);
      });

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
      if (isNativeGoogleSignInPending() || isGoogleSignInRedirectPending()) return;
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
    registerImmediateLogoutBridge();
    const onImmediateLogout = () => {
      applySignedOut();
      void teardownPushNotifications();
    };
    window.addEventListener(IMMEDIATE_LOGOUT_EVENT, onImmediateLogout);
    return () => {
      unregisterImmediateLogoutBridge();
      window.removeEventListener(IMMEDIATE_LOGOUT_EVENT, onImmediateLogout);
    };
  }, []);

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
    if (manualLogoutRef.current) return;
    manualLogoutRef.current = true;
    setIsLoadingAuth(true);
    try {
      clearLoginTime();
      clearDailyCodeSession();
      clearBackgroundPending();
      clearLastAppRoute();
      await stopAllBackgroundAudio();
      await teardownPushNotifications();
      await stopPresenceSession();
      await authApi.logout();
      applySignedOut();
    } catch (err) {
      console.warn("Sign out failed:", err);
      applySignedOut();
    } finally {
      manualLogoutRef.current = false;
      if (shouldRedirect && !Capacitor.isNativePlatform()) {
        window.location.href = "/";
      }
    }
  };
  logoutRef.current = logout;

  const navigateToLogin = () =>
    authApi.signInWithOAuth(OAUTH_PROVIDER_IDS.google);
  const signInWithOAuth = (providerId) =>
    authApi.signInWithOAuth(providerId);
  const signInWithEmail = (email, password) =>
    authApi.signInWithEmail(email, password);
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
        signInWithOAuth,
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
