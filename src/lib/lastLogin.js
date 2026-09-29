import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

/** Write last login timestamp to the user's Firestore profile (fire-and-forget). */
export function persistLastLoginAt() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const last_login_at = new Date().toISOString();
  void setDoc(doc(db, "users", uid), { last_login_at }, { merge: true }).catch((err) => {
    console.warn("[Auth] last_login_at update failed:", err?.message || err);
  });
}

export function parseProfileTimestamp(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value?.toDate) return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatTimeSince(ms) {
  const delta = Date.now() - ms;
  if (delta < 0) return "Just now";
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  const years = Math.floor(days / 365);
  return `${years} yr ago`;
}

export function formatLastLoginLabel(user) {
  const ms = parseProfileTimestamp(user?.last_login_at);
  if (ms == null) return "Never";
  return formatTimeSince(ms);
}

export function formatLastLoginTitle(user) {
  const ms = parseProfileTimestamp(user?.last_login_at);
  if (ms == null) return "No recorded login yet";
  return new Date(ms).toLocaleString();
}
