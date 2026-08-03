import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import {
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { getFunctions, httpsCallable } from "firebase/functions";
import { auth, db, app, storage } from "@/lib/firebase";
import { uploadPublicAudio, uploadPrivateAudio } from "@/api/storage";
import { getDownloadURL, ref } from "firebase/storage";
import seedData from "../../scripts/seed-data.json";
import { isDefaultSetupComplete } from "@/lib/defaultSeed";
import { markOAuthRedirectPending, recordLoginTime, clearLoginTime } from "@/lib/logoutOnClose";
import { addUserChannelMembership } from "@/lib/channelMembership";
import { clearDailyCodeSession } from "@/lib/dailyCode";
import { clearBiometricCredentials } from "@/lib/biometricAuth";

const functions = getFunctions(app, "us-east5");

async function verifyRecaptchaToken(token) {
  if (!token) {
    throw Object.assign(new Error("Please complete the reCAPTCHA."), {
      code: "auth/recaptcha-required",
    });
  }

  const callable = httpsCallable(functions, "verifyRecaptcha");
  try {
    await callable({ token });
  } catch (err) {
    const message =
      err?.message?.includes("reCAPTCHA")
        ? err.message
        : "reCAPTCHA verification failed. Please try again.";
    throw Object.assign(new Error(message), { code: "auth/recaptcha-failed" });
  }
}

/** Ensure Firestore requests run with a fresh auth token attached. */
async function waitForFirestoreAuth({ forceRefresh = false } = {}) {
  await auth.authStateReady();
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) {
    throw Object.assign(new Error("Not authenticated"), { code: "auth/not-authenticated" });
  }
  await firebaseUser.getIdToken(forceRefresh);
  return firebaseUser;
}

/** Refresh the ID token and return the current Firebase uid for Firestore writes. */
async function requireAuthUid({ forceRefresh = true } = {}) {
  const firebaseUser = await waitForFirestoreAuth({ forceRefresh });
  return firebaseUser.uid;
}

async function addDocWithAuthRetry(collectionName, payload, maxAttempts = 4) {
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await addDoc(collection(db, collectionName), payload);
    } catch (err) {
      lastErr = err;
      const code = err?.code || "";
      const retryable =
        code === "permission-denied"
        || code === "unavailable"
        || code === "deadline-exceeded"
        || code === "resource-exhausted"
        || code === "aborted";
      if (!retryable || attempt >= maxAttempts - 1) throw err;
      if (code === "permission-denied") {
        await requireAuthUid({ forceRefresh: true });
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw lastErr;
}

function omitUndefinedFields(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

export function formatAuthError(err) {
  switch (err?.code) {
    case "auth/email-already-in-use":
      return "An account already exists with this email. Sign in instead.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/unauthorized-domain":
      return "This site is not authorized for sign-in yet. Add this domain in Firebase Authentication → Settings → Authorized domains.";
    case "auth/operation-not-allowed":
      return "Email/password sign-in is not enabled yet. Enable Email/Password in Firebase Authentication → Sign-in method.";
    case "auth/popup-blocked":
      return "Pop-up was blocked. Allow pop-ups for this site, or try again.";
    case "auth/popup-closed-by-user":
      return "Sign-in was cancelled.";
    case "auth/recaptcha-required":
      return "Please complete the \"I'm not a robot\" check.";
    case "auth/recaptcha-failed":
      return "reCAPTCHA verification failed. Please try again.";
    default:
      return err?.message || "Something went wrong. Please try again.";
  }
}

const CHANGE_TYPE_MAP = {
  added: "create",
  modified: "update",
  removed: "delete",
};

function toIsoDate(value) {
  if (!value) return value;
  if (value?.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

function docToObject(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    ...data,
    created_date: toIsoDate(data.created_date),
  };
}

/** @returns {{ field: string, direction: import('firebase/firestore').OrderByDirection }} */
function parseSort(sortField) {
  if (!sortField) return { field: "created_date", direction: "desc" };
  const desc = sortField.startsWith("-");
  const field = desc ? sortField.slice(1) : sortField;
  return { field, direction: desc ? "desc" : "asc" };
}

function buildQuery(collectionName, filters = {}, sortField, limitCount) {
  const constraints = [];
  for (const [key, value] of Object.entries(filters)) {
    if (value && typeof value === "object" && "$lt" in value) {
      constraints.push(where(key, "<", value.$lt));
    } else {
      constraints.push(where(key, "==", value));
    }
  }
  const { field, direction } = parseSort(sortField);
  constraints.push(orderBy(field, direction));
  if (limitCount) constraints.push(limit(limitCount));
  return query(collection(db, collectionName), ...constraints);
}

function sortItems(items, sortField) {
  if (!sortField) return items;
  const { field, direction } = parseSort(sortField);
  return [...items].sort((a, b) => {
    const av = a[field] ?? "";
    const bv = b[field] ?? "";
    if (av < bv) return direction === "desc" ? 1 : -1;
    if (av > bv) return direction === "desc" ? -1 : 1;
    return 0;
  });
}

/** Re-throw permission errors so UI can show a real failure instead of silent empty data. */
function handleFirestoreQueryError(collectionName, err, context = {}) {
  if (err?.code === "permission-denied") {
    console.error(`Filter query failed for ${collectionName}:`, err, {
      uid: auth.currentUser?.uid,
      ...context,
    });
    throw err;
  }
  console.warn(`Filter query failed for ${collectionName}:`, err);
}

function createEntityApi(collectionName) {
  return {
    async list(sortField, limitCount) {
      let items = [];
      try {
        await waitForFirestoreAuth();
        const snap = await getDocs(collection(db, collectionName));
        items = sortItems(snap.docs.map(docToObject), sortField);
        if (limitCount) items = items.slice(0, limitCount);
      } catch (err) {
        if (err?.code === "permission-denied") {
          throw err;
        }
        if (err?.code === "auth/not-authenticated") {
          return [];
        }
        console.warn(`List query failed for ${collectionName}:`, err);
      }
      return items;
    },

    async filter(filters, sortField, limitCount) {
      let items = [];
      try {
        await waitForFirestoreAuth();
        const equalityConstraints = [];
        const rangeFilters = [];

        for (const [key, value] of Object.entries(filters)) {
          if (value && typeof value === "object" && "$lt" in value) {
            rangeFilters.push([key, value]);
          } else {
            equalityConstraints.push(where(key, "==", value));
          }
        }

        const snap = await getDocs(
          equalityConstraints.length
            ? query(collection(db, collectionName), ...equalityConstraints)
            : collection(db, collectionName)
        );
        items = snap.docs.map(docToObject);

        for (const [key, value] of rangeFilters) {
          items = items.filter((item) => item[key] < value.$lt);
        }
      } catch (err) {
        handleFirestoreQueryError(collectionName, err, { filters });
      }

      items = sortItems(items, sortField);
      if (limitCount) items = items.slice(0, limitCount);
      return items;
    },

    async create(data) {
      const uid = await requireAuthUid();
      const payload = {
        ...omitUndefinedFields(data),
        created_by_id: uid,
        created_date: serverTimestamp(),
      };
      const ref = await addDocWithAuthRetry(collectionName, payload);
      return {
        id: ref.id,
        ...data,
        created_by_id: payload.created_by_id,
        created_date: new Date().toISOString(),
      };
    },

    async update(id, data) {
      await waitForFirestoreAuth();
      await updateDoc(doc(db, collectionName, id), data);
      return { id, ...data };
    },

    async delete(id) {
      await deleteDoc(doc(db, collectionName, id));
    },

    async updateMany(_filters, updatePayload) {
      const snap = await getDocs(collection(db, collectionName));
      const batch = writeBatch(db);
      const setData = updatePayload.$set || updatePayload;
      snap.docs.forEach((d) => batch.update(d.ref, setData));
      await batch.commit();
    },

    async deleteMany(filters) {
      const q = buildQuery(collectionName, filters);
      const snap = await getDocs(q);
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    },

    subscribe(callback, filters = null) {
      let activeUnsub = () => {};
      let isInitial = true;
      let cancelled = false;
      let retryTimer = null;

      const matchesFilters = (data) => {
        if (!filters) return true;
        for (const [key, value] of Object.entries(filters)) {
          if (value && typeof value === "object" && "$lt" in value) {
            if (!(data[key] < value.$lt)) return false;
          } else if (data[key] !== value) {
            return false;
          }
        }
        return true;
      };

      const emitChanges = (snapshot) => {
        if (isInitial) {
          isInitial = false;
          return;
        }
        snapshot.docChanges().forEach((change) => {
          const data = docToObject(change.doc);
          if (!matchesFilters(data)) return;
          callback({
            type: CHANGE_TYPE_MAP[change.type] || change.type,
            data,
          });
        });
      };

      const attachListener = async (isRetry = false) => {
        if (cancelled) return;

        try {
          await waitForFirestoreAuth({ forceRefresh: isRetry });
        } catch {
          return;
        }
        if (cancelled) return;

        const equalityConstraints = [];
        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            if (value && typeof value === "object" && "$lt" in value) continue;
            equalityConstraints.push(where(key, "==", value));
          }
        }

        const q = equalityConstraints.length
          ? query(collection(db, collectionName), ...equalityConstraints)
          : collection(db, collectionName);

        activeUnsub = onSnapshot(
          q,
          emitChanges,
          (err) => {
            if (err?.code === "permission-denied") {
              if (!isRetry) {
                retryTimer = setTimeout(() => {
                  activeUnsub();
                  isInitial = true;
                  attachListener(true);
                }, 1200);
                return;
              }
              activeUnsub();
              return;
            }
            console.error(`Subscribe failed for ${collectionName}:`, err);
          }
        );
      };

      attachListener();

      return () => {
        cancelled = true;
        if (retryTimer) clearTimeout(retryTimer);
        activeUnsub();
      };
    },

    /** One listener per filter set (e.g. per channel_id) to satisfy Firestore rules. */
    subscribeMany(callback, filtersList) {
      if (!filtersList?.length) return () => {};
      const unsubs = filtersList.map((filters) => this.subscribe(callback, filters));
      return () => unsubs.forEach((unsub) => unsub());
    },
  };
}

/** @returns {Promise<{ id: string, email: string | null, role?: string, [key: string]: unknown }>} */
async function getCurrentUser() {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) throw new Error("Not authenticated");
  const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
  if (!userDoc.exists()) throw new Error("User not registered");
  return {
    id: firebaseUser.uid,
    email: firebaseUser.email,
    ...userDoc.data(),
  };
}

export const organizationsApi = {
  async list() {
    const snap = await getDocs(collection(db, "organizations"));
    return snap.docs.map(docToObject);
  },

  async create({ id, name }) {
    const orgId = id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    await setDoc(doc(db, "organizations", orgId), { name });
    return { id: orgId, name };
  },

  async update(id, data) {
    await updateDoc(doc(db, "organizations", id), data);
    return { id, ...data };
  },

  async delete(id) {
    await deleteDoc(doc(db, "organizations", id));
  },
};

const channelsApi = createEntityApi("channels");

function omitInactiveChannels(items) {
  return items.filter((item) => item.is_active !== false);
}

export const entities = {
  Channel: {
    ...channelsApi,
    async list(sortField, limitCount) {
      return omitInactiveChannels(await channelsApi.list(sortField, limitCount));
    },
    async filter(filters, sortField, limitCount) {
      return omitInactiveChannels(await channelsApi.filter(filters, sortField, limitCount));
    },
  },
  User: {
    ...createEntityApi("users"),
    async list() {
      const snap = await getDocs(collection(db, "users"));
      return snap.docs.map(docToObject);
    },
  },
  VoiceMessage: createEntityApi("voiceMessages"),
  PTTSignal: createEntityApi("pttSignals"),
  AudioChunk: {
    ...createEntityApi("audioChunks"),
    /** Idempotent chunk write — safe when offline/retry replays the same sequence. */
    async createChunk(data) {
      const uid = await requireAuthUid();
      const chunkId = `${data.broadcast_id}_${data.sequence}`;
      const payload = {
        ...data,
        created_by_id: uid,
        created_date: serverTimestamp(),
      };
      const chunkRef = doc(db, "audioChunks", chunkId);
      try {
        await setDoc(chunkRef, payload, { merge: true });
      } catch (err) {
        if (err?.code !== "permission-denied") throw err;
        await requireAuthUid({ forceRefresh: true });
        await setDoc(chunkRef, payload, { merge: true });
      }
      return {
        id: chunkId,
        ...data,
        created_by_id: uid,
        created_date: new Date().toISOString(),
      };
    },
  },
  Contact: createEntityApi("contacts"),
  AccessRequest: createEntityApi("accessRequests"),
};

export function getAuthErrorMessage(err) {
  switch (err?.code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try signing in instead.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/user-not-found":
      return "No account found with this email. Try creating an account.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please try again later.";
    case "auth/unauthorized-domain":
      return "This site is not authorized for sign-in yet. Add presencetorchchurch.vercel.app to Firebase Authentication → Settings → Authorized domains.";
    case "auth/recaptcha-required":
      return "Please complete the \"I'm not a robot\" check.";
    case "auth/recaptcha-failed":
      return "reCAPTCHA verification failed. Please try again.";
    default:
      return err?.message || "Sign-in failed. Please try again.";
  }
}

export const authApi = {
  async me() {
    return getCurrentUser();
  },

  async updateMe(data) {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) throw new Error("Not authenticated");
    const updates = { ...data };
    if (updates.first_name || updates.last_name) {
      const first = updates.first_name ?? "";
      const last = updates.last_name ?? "";
      updates.full_name = [first, last].filter(Boolean).join(" ");
    }
    await updateDoc(doc(db, "users", firebaseUser.uid), updates);
    return getCurrentUser();
  },

  async logout(redirectUrl) {
    clearLoginTime();
    await signOut(auth);
    if (redirectUrl) {
      window.location.href = "/";
    }
  },

  async deleteAccount() {
    await waitForFirestoreAuth({ forceRefresh: true });
    const callable = httpsCallable(functions, "deleteUserAccount");
    await callable({});
    clearLoginTime();
    clearDailyCodeSession();
    await clearBiometricCredentials();
    try {
      await signOut(auth);
    } catch {
      /* auth user may already be removed server-side */
    }
    window.location.href = "/";
  },

  async redirectToLogin(captchaToken) {
    await verifyRecaptchaToken(captchaToken);

    if (Capacitor.isNativePlatform()) {
      const result = await FirebaseAuthentication.signInWithGoogle();
      const idToken = result.credential?.idToken;
      if (!idToken) {
        throw Object.assign(new Error("Google sign-in was cancelled."), { code: "auth/popup-closed-by-user" });
      }
      const credential = GoogleAuthProvider.credential(
        idToken,
        result.credential?.accessToken ?? undefined,
      );
      await signInWithCredential(auth, credential);
      recordLoginTime();
      return;
    }

    const provider = new GoogleAuthProvider();

    try {
      await signInWithPopup(auth, provider);
      recordLoginTime();
      return;
    } catch (err) {
      const useRedirect =
        err?.code === "auth/popup-blocked" ||
        err?.code === "auth/cancelled-popup-request" ||
        String(err?.message || "").includes("Cross-Origin-Opener-Policy");
      if (!useRedirect) throw err;
    }

    markOAuthRedirectPending();
    await signInWithRedirect(auth, provider);
  },

  async signInWithEmail(email, password, captchaToken) {
    await verifyRecaptchaToken(captchaToken);
    await signInWithEmailAndPassword(auth, email.trim(), password);
    recordLoginTime();
  },

  async signUpWithEmail(email, password, captchaToken) {
    await verifyRecaptchaToken(captchaToken);
    await createUserWithEmailAndPassword(auth, email.trim(), password);
    recordLoginTime();
  },

  async registerWithEmail({ email, password, firstName = "", lastName = "" }) {
    const trimmedEmail = email.trim();
    const first = firstName.trim();
    const last = lastName.trim();
    const fullName = [first, last].filter(Boolean).join(" ");

    const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);

    if (fullName) {
      await updateProfile(cred.user, { displayName: fullName });
    }

    await setDoc(
      doc(db, "users", cred.user.uid),
      {
        email: trimmedEmail,
        first_name: first,
        last_name: last,
        full_name: fullName,
        role: "user",
        onboarded: false,
        directed_channels: [],
        is_monitor: false,
        pending_staff_alerts: false,
      },
      { merge: true }
    );

    recordLoginTime();
    return cred.user;
  },

  async resetPassword(email) {
    await sendPasswordResetEmail(auth, email.trim());
  },
};

export const functionsApi = {
  async invoke(name, params) {
    if (name === "getSecureAudioUrl") {
      const fileUri = params.file_uri;
      if (!fileUri) return { data: { signed_url: null } };
      let path = fileUri;
      if (fileUri.startsWith("gs://")) {
        path = fileUri.replace(/^gs:\/\/[^/]+\//, "");
      }
      const url = await getDownloadURL(ref(storage, path));
      return { data: { signed_url: url } };
    }

    if (name === "requestAccess") {
      await addDoc(collection(db, "accessRequests"), {
        email: params.email,
        first_name: params.first_name,
        last_name: params.last_name,
        organization: params.organization,
        status: "pending",
        created_date: serverTimestamp(),
      });
      return { success: true };
    }

    if (name === "transcribeAudio") {
      const callable = httpsCallable(functions, "transcribeAudio");
      const result = await callable({
        message_id: params.message_id,
        audio_url: params.audio_url,
      });
      return result.data;
    }

    if (name === "exportTranscriptsToGoogleDoc") {
      const callable = httpsCallable(functions, "exportTranscriptsToGoogleDoc");
      const result = await callable({
        title: params.title,
        content: params.content,
        shareEmail: params.shareEmail,
      });
      return result.data;
    }

    if (name === "getAgoraToken") {
      const callable = httpsCallable(functions, "getAgoraToken");
      const payload = { channel_id: params.channel_id };
      if (typeof params.client_uid === "number" && Number.isFinite(params.client_uid)) {
        payload.client_uid = Math.floor(params.client_uid);
      }
      const result = await callable(payload);
      return result.data;
    }

    throw new Error(`Unknown function: ${name}`);
  },
};

export const integrations = {
  Core: {
    async UploadFile({ file }) {
      const path = `${Date.now()}_${file.name || "audio.webm"}`;
      return uploadPublicAudio(file, path);
    },
    async UploadPrivateFile({ file }) {
      const path = `messages/${crypto.randomUUID()}.webm`;
      return uploadPrivateAudio(file, path);
    },
  },
};

export const adminApi = {
  async deleteUser(targetUserId) {
    await waitForFirestoreAuth({ forceRefresh: true });
    const callable = httpsCallable(functions, "adminDeleteUser");
    return (await callable({ targetUserId })).data;
  },
};

export const bootstrapApi = {
  async seedDefaults() {
    const user = await getCurrentUser();
    const isSuper = user.role === "super_admin";
    const isAdmin = user.role === "admin";
    if (!isSuper && !isAdmin) {
      throw new Error("Only admins can initialize the database");
    }

    const [orgSnap, channelSnap] = await Promise.all([
      getDocs(collection(db, "organizations")),
      getDocs(collection(db, "channels")),
    ]);

    const existingOrgs = orgSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const existingChannels = channelSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (isDefaultSetupComplete(existingOrgs, existingChannels)) {
      return { seeded: false, message: "Safety Team and PH Kids are already set up" };
    }

    const now = serverTimestamp();
    let orgCount = 0;
    let channelCount = 0;

    if (isSuper) {
      for (const org of seedData.organizations) {
        const { id, ...data } = org;
        const exists = orgSnap.docs.some((d) => d.id === id);
        await setDoc(doc(db, "organizations", id), data, { merge: true });
        if (!exists) orgCount++;
      }
    } else if (seedData.organizations.some((org) => !orgSnap.docs.some((d) => d.id === org.id))) {
      throw new Error(
        "Organizations are missing. A super admin must initialize the database first."
      );
    }

    for (const channel of seedData.channels) {
      const { id, ...data } = channel;
      const existing = channelSnap.docs.find((d) => d.id === id);
      const createdDate = existing?.data()?.created_date ?? now;
      const exists = Boolean(existing);
      const members = existing?.data()?.members || [];
      const shouldJoin =
        (isSuper || isAdmin) &&
        !members.includes(user.id) &&
        !members.includes(user.email);
      await setDoc(
        doc(db, "channels", id),
        {
          ...data,
          created_date: createdDate,
          ...(shouldJoin ? { members: [...members, user.id] } : {}),
        },
        { merge: true }
      );
      if (shouldJoin) {
        await addUserChannelMembership(user.id, id);
      }
      if (!exists) channelCount++;
    }

    return {
      seeded: true,
      organizations: orgCount,
      channels: channelCount,
    };
  },
};

export const api = {
  entities,
  auth: authApi,
  admin: adminApi,
  functions: functionsApi,
  integrations,
  organizations: organizationsApi,
  bootstrap: bootstrapApi,
};
