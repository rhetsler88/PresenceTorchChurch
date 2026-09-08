import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("textMessageNotifications", () => {
  it("shows tray notifications in background instead of only playing a tone", () => {
    const source = readFileSync(join(root, "src/lib/textMessageNotifications.js"), "utf8");
    assert.ok(source.includes("export function maybeNotifyIncomingTextMessage"));
    assert.ok(source.includes("export async function showTextMessageTrayNotification"));
    assert.ok(source.includes("if (isAppInForeground())"));
    assert.ok(source.includes("playTextMessageTone()"));
    assert.ok(source.includes("Capacitor.isNativePlatform()"));
    assert.ok(source.includes("showTextMessageTrayNotification"));
  });

  it("routes passive listen providers through background-aware text notifications", () => {
    const talk = readFileSync(join(root, "src/components/ptt/PassiveTalkListenProvider.jsx"), "utf8");
    const monitor = readFileSync(join(root, "src/components/monitor/PassiveMonitorProvider.jsx"), "utf8");
    assert.ok(talk.includes("maybeNotifyIncomingTextMessage"));
    assert.ok(monitor.includes("maybeNotifyIncomingTextMessage"));
  });

  it("matches channel read access when choosing text message push recipients", () => {
    const source = readFileSync(join(root, "functions/alertRecipients.js"), "utf8");
    assert.ok(source.includes("function receivesChannelTextMessage"));
    assert.ok(source.includes("member_of_channels"));
    assert.ok(source.includes("notification_members"));
    assert.ok(source.includes("receivesChannelTextMessage(userData, channelData, channelId)"));
  });
});
