const { onValueWritten } = require("firebase-functions/v2/database");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

function presenceDocId(userId, channelId) {
  return `${userId}_${channelId}`;
}

/**
 * Mirror RTDB onDisconnect presence into Firestore for per-channel queries.
 * Clients write RTDB only; Firestore is read-only for presence (except admin).
 */
exports.syncPresenceToFirestore = onValueWritten(
  "/presence/{uid}/channels/{channelId}",
  async (event) => {
    const uid = event.params.uid;
    const channelId = event.params.channelId;
    const data = event.data.after.exists() ? event.data.after.val() : null;
    const docRef = getFirestore().doc(`presence/${presenceDocId(uid, channelId)}`);

    if (!data || data.state !== "online") {
      await docRef.delete().catch(() => {});
      return;
    }

    const lastChanged = Number(data.last_changed);
    const lastActiveMs = Number.isFinite(lastChanged) ? lastChanged : Date.now();

    await docRef.set(
      {
        user_id: uid,
        channel_id: channelId,
        display_name: data.display_name || "",
        state: "online",
        last_active_at: FieldValue.serverTimestamp(),
        last_active_ms: lastActiveMs,
      },
      { merge: true }
    );
  }
);
