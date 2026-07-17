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
      collectTokens(data.fcm_tokens, channelTokens);
    }

    if (isStaffAlertRecipient(userData)) {
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

  for (const field of ["fcm_tokens", "staff_fcm_tokens"]) {
    const tokens = userData[field];
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

  return { data: next, changed };
}

module.exports = {
  receivesChannelRedAlert,
  isStaffAlertRecipient,
  buildRedAlertTokenSets,
  removeStaleTokensFromUserData,
};
