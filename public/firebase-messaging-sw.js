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

messaging.onBackgroundMessage((payload) => {
  const data = payload?.data || {};
  if (data.type === "red_alert") {
    const channelName = data.channelName || data.channel_name || "A channel";
    const title = payload.notification?.title || "RED ALERT";
    const body =
      payload.notification?.body || `Code Red — ${channelName} — Secure Now`;

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
    const title = payload.notification?.title || data.channelName || "New message";
    const body = payload.notification?.body || "New text message";
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: `text_message_${data.messageId || data.channelId || title}`,
      renotify: true,
      data,
    });
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
