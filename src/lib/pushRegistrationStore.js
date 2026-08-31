import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

function uniqueTokens(registrations) {
  return [...new Set(Object.values(registrations).map((entry) => entry.token).filter(Boolean))];
}

function staffTokens(registrations) {
  return [
    ...new Set(
      Object.values(registrations)
        .filter((entry) => entry.staff && entry.token)
        .map((entry) => entry.token)
    ),
  ];
}

/** Keep only the current signed-in session's registration (PWA, native, or desktop web). */
export function buildRegistrationPatch(existingRegistrations, registrationKey, entry) {
  const existing = existingRegistrations?.[registrationKey];
  const registrations = {
    [registrationKey]: {
      ...entry,
      text_message_unread: existing?.text_message_unread || {},
    },
  };

  return {
    fcm_registrations: registrations,
    fcm_tokens: uniqueTokens(registrations),
    staff_fcm_tokens: staffTokens(registrations),
    active_push_registration_key: registrationKey,
  };
}

export async function upsertPushRegistration(uid, registrationKey, entry) {
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  const patch = buildRegistrationPatch(snap.data()?.fcm_registrations, registrationKey, entry);
  await updateDoc(userRef, patch);
  return patch;
}

export async function removePushRegistration(uid, registrationKey) {
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  const existing = snap.data()?.fcm_registrations || {};
  if (!existing[registrationKey]) return;

  const registrations = { ...existing };
  delete registrations[registrationKey];

  await updateDoc(userRef, {
    fcm_registrations: registrations,
    fcm_tokens: uniqueTokens(registrations),
    staff_fcm_tokens: staffTokens(registrations),
  });
}
