import { PROTECTION_LEVELS } from "@/components/ptt/ProtectionLevelBadge";

export const PROTECTION_LEVEL_CHANGE_TYPE = "protection_level_change";

export function isProtectionLevelChangeMessage(message) {
  return message?.message_type === PROTECTION_LEVEL_CHANGE_TYPE;
}

export function formatProtectionLevelLabel(level) {
  const config = PROTECTION_LEVELS[level] || PROTECTION_LEVELS.green;
  return `${config.label} — ${config.desc}`;
}
