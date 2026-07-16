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
import { auth, db } from "@/lib/firebase";
import { uploadPublicAudio, uploadPrivateAudio } from "@/api/storage";
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "@/lib/firebase";
import seedData from "../../scripts/seed-data.json";
import { isDefaultSetupComplete } from "@/lib/defaultSeed";

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

function createEntityApi(collectionName) {
  return {
    async list(sortField, limitCount) {
      let items = [];
      try {
        const q = buildQuery(collectionName, {}, sortField, limitCount);
        const snap = await getDocs(q);
        items = snap.docs.map(docToObject);
      } catch (err) {
        console.warn(`Sorted query failed for ${collectionName}:`, err);
      }

      // Documents missing the orderBy field are excluded from sorted queries.
      if (items.length === 0) {
        const snap = await getDocs(collection(db, collectionName));
        items = sortItems(snap.docs.map(docToObject), sortField);
        if (limitCount) items = items.slice(0, limitCount);
      }

      return items;
    },

    async filter(filters, sortField, limitCount) {
      let items = [];
      try {
        const q = buildQuery(collectionName, filters, sortField, limitCount);
        const snap = await getDocs(q);
        items = snap.docs.map(docToObject);
      } catch (err) {
        console.warn(`Filtered query failed for ${collectionName}:`, err);
      }

      if (items.length === 0) {
        const snap = await getDocs(collection(db, collectionName));
        items = snap.docs.map(docToObject).filter((item) => {
          for (const [key, value] of Object.entries(filters)) {
            if (value && typeof value === "object" && "$lt" in value) {
              if (!(item[key] < value.$lt)) return false;
            } else if (item[key] !== value) {
              return false;
            }
          }
          return true;
        });
        items = sortItems(items, sortField);
        if (limitCount) items = items.slice(0, limitCount);
      }

      return items;
    },

    async create(data) {
      const uid = auth.currentUser?.uid;
      const payload = {
        ...data,
        created_by_id: data.created_by_id ?? uid ?? null,
        created_date: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, collectionName), payload);
      return { id: ref.id, ...data, created_by_id: payload.created_by_id };
    },

    async update(id, data) {
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

    subscribe(callback) {
      const emitChanges = (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          callback({
            type: CHANGE_TYPE_MAP[change.type] || change.type,
            data: docToObject(change.doc),
          });
        });
      };

      const sortedQuery = query(
        collection(db, collectionName),
        orderBy("created_date", "desc")
      );

      return onSnapshot(
        sortedQuery,
        emitChanges,
        (err) => {
          console.warn(`Sorted subscribe failed for ${collectionName}:`, err);
          onSnapshot(collection(db, collectionName), emitChanges);
        }
      );
    },
  };
}

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

export const entities = {
  Channel: createEntityApi("channels"),
  User: {
    ...createEntityApi("users"),
    async list() {
      const snap = await getDocs(collection(db, "users"));
      return snap.docs.map(docToObject);
    },
  },
  VoiceMessage: createEntityApi("voiceMessages"),
  PTTSignal: createEntityApi("pttSignals"),
  AudioChunk: createEntityApi("audioChunks"),
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
    localStorage.removeItem("presence_login_time");
    await signOut(auth);
    if (redirectUrl) {
      window.location.href = "/";
    }
  },

  async redirectToLogin() {
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
      return;
    }

    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      if (err?.code === "auth/popup-blocked" || err?.code === "auth/popup-closed-by-user") {
        await signInWithRedirect(auth, provider);
        return;
      }
      console.error("Sign-in failed:", err);
      throw err;
    }
  },

  async signInWithEmail(email, password) {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  },

  async signUpWithEmail(email, password) {
    await createUserWithEmailAndPassword(auth, email.trim(), password);
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
      },
      { merge: true }
    );

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
      const { message_id } = params;
      if (message_id) {
        await updateDoc(doc(db, "voiceMessages", message_id), {
          transcript: "[Transcription unavailable]",
          is_transcribed: true,
        });
      }
      return { transcript: "[Transcription unavailable]" };
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
  functions: functionsApi,
  integrations,
  organizations: organizationsApi,
  bootstrap: bootstrapApi,
};
