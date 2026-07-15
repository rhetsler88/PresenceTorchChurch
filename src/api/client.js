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
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { uploadPublicAudio, uploadPrivateAudio } from "@/api/storage";
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "@/lib/firebase";

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

function createEntityApi(collectionName) {
  return {
    async list(sortField, limitCount) {
      const q = buildQuery(collectionName, {}, sortField, limitCount);
      const snap = await getDocs(q);
      return snap.docs.map(docToObject);
    },

    async filter(filters, sortField, limitCount) {
      const q = buildQuery(collectionName, filters, sortField, limitCount);
      const snap = await getDocs(q);
      return snap.docs.map(docToObject);
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
      const q = query(
        collection(db, collectionName),
        orderBy("created_date", "desc")
      );
      return onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          callback({
            type: CHANGE_TYPE_MAP[change.type] || change.type,
            data: docToObject(change.doc),
          });
        });
      });
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
    if (snap.empty) {
      return [{ id: "default", name: "Potter's House - Columbus" }];
    }
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

export const api = {
  entities,
  auth: authApi,
  functions: functionsApi,
  integrations,
  organizations: organizationsApi,
};
