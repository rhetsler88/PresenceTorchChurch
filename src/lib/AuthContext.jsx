import React, { createContext, useState, useContext, useEffect } from "react";
import { onAuthStateChanged, getRedirectResult } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { authApi } from "@/api/client";

const AuthContext = createContext();

const AUTO_LOGOUT_MS = 88 * 60 * 60 * 1000;
const LOGIN_TIME_KEY = "presence_login_time";

function isSessionExpired() {
  const loginTime = localStorage.getItem(LOGIN_TIME_KEY);
  if (!loginTime) return false;
  return Date.now() - parseInt(loginTime, 10) >= AUTO_LOGOUT_MS;
}

async function expireSession() {
  localStorage.removeItem(LOGIN_TIME_KEY);
  await authApi.logout();
}

async function loadOrCreateUser(firebaseUser) {
  const userRef = doc(db, "users", firebaseUser.uid);
  const userDoc = await getDoc(userRef);

  if (!userDoc.exists()) {
    const displayName = firebaseUser.displayName || "";
    const [firstName = "", ...rest] = displayName.split(" ");
    const profile = {
      email: firebaseUser.email,
      first_name: firstName,
      last_name: rest.join(" "),
      full_name: displayName,
      role: "user",
      onboarded: false,
      directed_channels: [],
      is_monitor: false,
    };
    await setDoc(userRef, profile);
    return { id: firebaseUser.uid, ...profile };
  }

  return {
    id: firebaseUser.uid,
    email: firebaseUser.email,
    ...userDoc.data(),
  };
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

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await authApi.me();

      const loginTime = localStorage.getItem(LOGIN_TIME_KEY);
      if (loginTime) {
        if (isSessionExpired()) {
          await expireSession();
          applySignedOut();
          setAuthError({ type: "auth_required", message: "Session expired" });
          return;
        }
      } else {
        localStorage.setItem(LOGIN_TIME_KEY, Date.now().toString());
      }

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
  };

  const checkAppState = async () => {
    setIsLoadingPublicSettings(false);
    await checkUserAuth();
  };

  useEffect(() => {
    setIsLoadingAuth(true);
    getRedirectResult(auth).catch((error) => {
      console.error("Redirect sign-in failed:", error);
    });

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        applySignedOut();
        return;
      }

      try {
        if (isSessionExpired()) {
          await expireSession();
          applySignedOut();
          setAuthError({ type: "auth_required", message: "Session expired" });
          return;
        }

        const currentUser = await loadOrCreateUser(firebaseUser);

        const loginTime = localStorage.getItem(LOGIN_TIME_KEY);
        if (!loginTime) {
          localStorage.setItem(LOGIN_TIME_KEY, Date.now().toString());
        }

        applyAuthenticatedUser(currentUser);
      } catch (error) {
        console.error("Auth state error:", error);
        setAuthError({ type: "unknown", message: error.message });
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    });

    return unsub;
  }, []);

  useEffect(() => {
    const loginTime = localStorage.getItem(LOGIN_TIME_KEY);
    if (!loginTime || !isAuthenticated) return;

    const remaining = AUTO_LOGOUT_MS - (Date.now() - parseInt(loginTime, 10));
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
        window.location.href = "/";
      });
    }, remaining);

    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  const logout = async (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem(LOGIN_TIME_KEY);
    await authApi.logout(shouldRedirect ? window.location.href : undefined);
  };

  const navigateToLogin = () => authApi.redirectToLogin();

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
        checkUserAuth,
        checkAppState,
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
