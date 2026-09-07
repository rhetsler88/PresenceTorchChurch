import { initializeApp, getApp, getApps } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported } from "firebase/messaging";
import { Capacitor } from "@capacitor/core";

const firebaseConfig = {
  apiKey: "AIzaSyCfhAWoGKj8E7Kx0hzqsuOLrExxnmal-Ws",
  authDomain: "presence-torch-church.firebaseapp.com",
  projectId: "presence-torch-church",
  storageBucket: "presence-torch-church.firebasestorage.app",
  messagingSenderId: "956501692008",
  appId: "1:956501692008:web:12f8f8ad119b32c1e335dd",
  measurementId: "G-QNHVG4NRR7",
  databaseURL: "https://presence-torch-church-default-rtdb.firebaseio.com",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function createAuth() {
  if (Capacitor.isNativePlatform()) {
    try {
      // Required for Firebase JS SDK + Firestore in Capacitor WebView (see @capacitor-firebase/authentication docs).
      return initializeAuth(app, {
        persistence: indexedDBLocalPersistence,
      });
    } catch {
      return getAuth(app);
    }
  }
  return getAuth(app);
}

export const auth = createAuth();
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);

let messagingPromise = null;

export async function getFirebaseMessaging() {
  if (Capacitor.isNativePlatform()) return null;
  if (messagingPromise) return messagingPromise;

  messagingPromise = (async () => {
    if (!(await isSupported())) return null;
    return getMessaging(app);
  })();

  return messagingPromise;
}
