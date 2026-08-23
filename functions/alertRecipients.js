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

/** One active token per user — most recently updated registration wins. */
function collectActiveRegistrationToken(registrations, tokenSet, { staffOnly = false } = {}) {
  if (!registrations || typeof registrations !== "object") return;

  const entries = Object.values(registrations).filter(
    (entry) => entry?.token && (!staffOnly || entry.staff)
  );
  if (entries.length === 0) return;

  entries.sort((a, b) =>
    String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
  );
  tokenSet.add(entries[0].token);
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
      const before = channelTokens.size;
      collectActiveRegistrationToken(data.fcm_registrations, channelTokens);
      if (channelTokens.size === before) collectTokens(data.fcm_tokens, channelTokens);
    }

    if (isStaffAlertRecipient(userData)) {
      const before = staffTokens.size;
      collectActiveRegistrationToken(data.fcm_registrations, staffTokens, { staffOnly: true });
      if (staffTokens.size === before) {
        collectTokens(data.staff_fcm_tokens, staffTokens);
        collectTokens(data.fcm_tokens, staffTokens);
      }
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

/** FCM tokens for channel members except the sender (text message alerts). */
function buildTextMessageTokenSet(usersSnap, channelData, senderId) {
  return buildTextMessageRecipients(usersSnap, channelData, senderId).flatMap(
    (recipient) => recipient.tokens
  );
}

/** Channel members (except sender) with their device tokens for text message alerts. */
function buildTextMessageRecipients(usersSnap, channelData, senderId) {
  const recipients = [];

  usersSnap.forEach((doc) => {
    if (doc.id === senderId) return;
    const data = doc.data();
    const userData = { id: doc.id, email: data.email, ...data };
    if (!receivesChannelRedAlert(userData, channelData)) return;

    const tokens = new Set();
    collectActiveRegistrationToken(data.fcm_registrations, tokens);
    if (tokens.size === 0) collectTokens(data.fcm_tokens, tokens);
    if (tokens.size === 0) return;

    recipients.push({
      userId: doc.id,
      tokens: [...tokens],
    });
  });

  return recipients;
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
  buildTextMessageTokenSet,
  buildTextMessageRecipients,
  removeStaleTokensFromUserData,
};
