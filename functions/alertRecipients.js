function isListed(id, email, list = []) {
  if (!Array.isArray(list) || list.length === 0) return false;
  if (id && list.includes(id)) return true;
  if (email && list.includes(email)) return true;
  return false;
}

function receivesChannelRedAlert(userData, channelData) {
  return isListed(userData.id, userData.email, channelData.members);
}

function isStaffAlertRecipient(userData) {
  return userData.receives_staff_alerts === true;
}

function collectTokens(list, tokenSet) {
  if (!Array.isArray(list)) return;
  list.forEach((token) => {
    if (typeof token === "string" && token.length > 0) tokenSet.add(token);
  });
}

function collectRegistrationTokens(registrations, tokenSet, { staffOnly = false } = {}) {
  if (!registrations || typeof registrations !== "object") return;
  Object.values(registrations).forEach((entry) => {
    if (!entry?.token) return;
    if (staffOnly && !entry.staff) return;
    tokenSet.add(entry.token);
  });
}

/**
 * Channel-scoped FCM tokens (full channel members only).
 * Staff global tokens (any channel red), excluding duplicates already in channel set.
 */
function buildRedAlertTokenSets(usersSnap, channelData) {
  const channelTokens = new Set();
  const staffTokens = new Set();

  usersSnap.forEach((doc) => {
    const data = doc.data();
    const userData = { id: doc.id, email: data.email, ...data };

    if (receivesChannelRedAlert(userData, channelData)) {
      collectRegistrationTokens(data.fcm_registrations, channelTokens);
      collectTokens(data.fcm_tokens, channelTokens);
    }

    if (isStaffAlertRecipient(userData)) {
      collectRegistrationTokens(data.fcm_registrations, staffTokens);
      collectTokens(data.staff_fcm_tokens, staffTokens);
      collectTokens(data.fcm_tokens, staffTokens);
    }
  });

  staffTokens.forEach((token) => {
    if (channelTokens.has(token)) staffTokens.delete(token);
  });

  return {
    channelTokens: [...channelTokens],
    staffTokens: [...staffTokens],
  };
}

function removeStaleTokensFromUserData(userData, staleSet) {
  let next = userData;
  let changed = false;

  const registrations = userData.fcm_registrations;
  if (registrations && typeof registrations === "object") {
    const cleanedRegistrations = {};
    let registrationsChanged = false;

    for (const [key, entry] of Object.entries(registrations)) {
      if (entry?.token && staleSet.has(entry.token)) {
        registrationsChanged = true;
        continue;
      }
      cleanedRegistrations[key] = entry;
    }

    if (registrationsChanged) {
      next = { ...userData, fcm_registrations: cleanedRegistrations };
      changed = true;
    }
  }

  for (const field of ["fcm_tokens", "staff_fcm_tokens"]) {
    const tokens = (changed ? next : userData)[field];
    if (!Array.isArray(tokens)) continue;
    const cleaned = tokens.filter((t) => !staleSet.has(t));
    if (cleaned.length !== tokens.length) {
      if (!changed) {
        next = { ...userData };
        changed = true;
      }
      next[field] = cleaned;
    }
  }

  if (changed && next.fcm_registrations) {
    const allTokens = [
      ...new Set(
        Object.values(next.fcm_registrations)
          .map((entry) => entry?.token)
          .filter(Boolean)
      ),
    ];
    const staffOnlyTokens = [
      ...new Set(
        Object.values(next.fcm_registrations)
          .filter((entry) => entry?.staff && entry?.token)
          .map((entry) => entry.token)
      ),
    ];
    next.fcm_tokens = allTokens;
    next.staff_fcm_tokens = staffOnlyTokens;
  }

  return { data: next, changed };
}

module.exports = {
  receivesChannelRedAlert,
  isStaffAlertRecipient,
  buildRedAlertTokenSets,
  removeStaleTokensFromUserData,
};
