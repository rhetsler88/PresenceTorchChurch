import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { initAppCheck } from "@/lib/appCheck";

const firebaseConfig = {
  apiKey: "AIzaSyCfhAWoGKj8E7Kx0hzqsuOLrExxnmal-Ws",
  authDomain: "presence-torch-church.firebaseapp.com",
  projectId: "presence-torch-church",
  storageBucket: "presence-torch-church.firebasestorage.app",
  messagingSenderId: "956501692008",
  appId: "1:956501692008:web:12f8f8ad119b32c1e335dd",
  measurementId: "G-QNHVG4NRR7",
};

export const app = initializeApp(firebaseConfig);
initAppCheck(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
