import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

/**
 * Verify Auth + Firestore are reachable for the signed-in user.
 * Throws with a user-friendly message on failure.
 */
export async function verifyFirebaseConnection() {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) {
    throw Object.assign(new Error("Sign-in did not complete. Please try again."), {
      code: "auth/not-authenticated",
    });
  }

  await user.getIdToken(true);

  try {
    await getDoc(doc(db, "users", user.uid));
  } catch (err) {
    const code = err?.code || "";
    if (code === "permission-denied") {
      throw Object.assign(
        new Error("Connected to Firebase, but your account is not registered yet."),
        { code: "firestore/permission-denied" }
      );
    }
    if (code === "unavailable" || code === "deadline-exceeded") {
      throw Object.assign(
        new Error("Could not reach Firebase. Check your internet connection and try again."),
        { code: "firestore/unavailable" }
      );
    }
    throw Object.assign(
      new Error(err?.message || "Could not load your profile from Firebase."),
      { code: code || "firestore/unknown" }
    );
  }

  return { uid: user.uid, email: user.email };
}
