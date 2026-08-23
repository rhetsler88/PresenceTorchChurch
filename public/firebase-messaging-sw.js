/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCfhAWoGKj8E7Kx0hzqsuOLrExxnmal-Ws",
  authDomain: "presence-torch-church.firebaseapp.com",
  projectId: "presence-torch-church",
  storageBucket: "presence-torch-church.firebasestorage.app",
  messagingSenderId: "956501692008",
  appId: "1:956501692008:web:12f8f8ad119b32c1e335dd",
});

const messaging = firebase.messaging();

function formatTextMessageBody(count, channelName) {
  const safeCount = Number.parseInt(String(count || "1"), 10);
  const normalizedCount = Number.isFinite(safeCount) && safeCount > 0 ? safeCount : 1;
  const label = normalizedCount === 1 ? "text message" : "text messages";
  return `${normalizedCount} new ${label} in ${channelName || "Channel"}`;
}

function clearTextMessageNotifications() {
  if (typeof self.registration?.getNotifications !== "function") {
    return Promise.resolve();
  }
  return self.registration.getNotifications().then((notifications) => {
    notifications.forEach((notification) => {
      const tag = notification.tag || "";
      const type = notification.data?.type;
      if (type === "text_message" || tag.startsWith("text_message_")) {
        notification.close();
      }
    });
  });
}

messaging.onBackgroundMessage((payload) => {
  const data = payload?.data || {};
  if (data.type === "red_alert") {
    const channelName = data.channelName || data.channel_name || "A channel";
    const title = data.title || "RED ALERT";
    const body = data.body || `Code Red — ${channelName} — Secure Now`;

    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: `red_alert_${data.channelId || channelName}`,
      renotify: true,
      data,
    });
    return;
  }

  if (data.type === "text_message") {
    const channelId = data.channelId || data.channel_id || "channel";
    const channelName = data.channelName || data.channel_name || "Channel";
    const count = data.unreadCount || data.unread_count || "1";
    const title = data.title || "Presence Torch";
    const body = data.body || formatTextMessageBody(count, channelName);
    const tag = data.notificationTag || `text_message_${channelId}`;

    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag,
      data,
    });
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "clear_text_message_notifications") {
    event.waitUntil(clearTextMessageNotifications());
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    })
  );
});
