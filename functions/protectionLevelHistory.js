const { FieldValue } = require("firebase-admin/firestore");

const PROTECTION_LEVELS = {
  blue: { label: "Blue", desc: "All Clear" },
  green: { label: "Green", desc: "Safe" },
  yellow: { label: "Yellow", desc: "Caution" },
  red: { label: "Red", desc: "Danger" },
};

const MESSAGE_TYPE = "protection_level_change";

function formatProtectionLevelLabel(level) {
  const config = PROTECTION_LEVELS[level] || PROTECTION_LEVELS.green;
  return `${config.label} — ${config.desc}`;
}

function formatProtectionChangeText(fromLevel, toLevel) {
  const fromLabel = formatProtectionLevelLabel(fromLevel);
  const toLabel = formatProtectionLevelLabel(toLevel);
  if (fromLevel === toLevel) return `Protection level set to ${toLabel}`;
  return `Protection level changed from ${fromLabel} to ${toLabel}`;
}

function deviceDayKey(date = new Date()) {
  const d = new Date(date);
  d.setHours(d.getHours() - 6);
  return d.toLocaleDateString("en-CA");
}

function deviceTime(date = new Date()) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

async function logProtectionLevelChange(db, channelId, fromLevel, toLevel, timestamp = {}) {
  const now = new Date();
  const from = fromLevel || "green";
  const to = toLevel || "green";
  const deviceTimeValue = typeof timestamp.device_time === "string" && timestamp.device_time.trim()
    ? timestamp.device_time.trim()
    : deviceTime(now);
  const deviceDateValue = typeof timestamp.device_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(timestamp.device_date)
    ? timestamp.device_date
    : deviceDayKey(now);

  await db.collection("voiceMessages").add({
    channel_id: channelId,
    message_type: MESSAGE_TYPE,
    text_content: formatProtectionChangeText(from, to),
    protection_level: to,
    protection_level_from: from,
    sender_name: "System",
    sender_email: "",
    is_transcribed: true,
    created_by_id: "system",
    created_date: FieldValue.serverTimestamp(),
    device_time: deviceTimeValue,
    device_date: deviceDateValue,
  });
}

module.exports = {
  MESSAGE_TYPE,
  formatProtectionChangeText,
  logProtectionLevelChange,
};
