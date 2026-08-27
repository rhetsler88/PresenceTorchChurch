import { useCallback, useEffect, useState } from "react";
import {
  getUserListenVolume,
  listUserListenOverrides,
  PTT_SETTINGS_CHANGED,
  setUserListenVolume,
  clearUserListenVolume,
} from "@/lib/pttSettings";

export default function usePttSettings() {
  const [overrides, setOverrides] = useState(listUserListenOverrides);

  useEffect(() => {
    const sync = () => setOverrides(listUserListenOverrides());
    window.addEventListener(PTT_SETTINGS_CHANGED, sync);
    return () => window.removeEventListener(PTT_SETTINGS_CHANGED, sync);
  }, []);

  const updateUserListenVolume = useCallback((userId, value, options) => {
    setUserListenVolume(userId, value, options);
    setOverrides(listUserListenOverrides());
  }, []);

  const resetUserListenVolume = useCallback((userId) => {
    clearUserListenVolume(userId);
    setOverrides(listUserListenOverrides());
  }, []);

  return {
    overrides,
    getUserListenVolume,
    setUserListenVolume: updateUserListenVolume,
    resetUserListenVolume,
  };
}
