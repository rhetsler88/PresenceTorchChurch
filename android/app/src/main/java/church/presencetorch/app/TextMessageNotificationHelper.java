package church.presencetorch.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;

/** Clears delivered text-message push notifications (not the background listen FGS). */
public final class TextMessageNotificationHelper {
    public static final String CHANNEL_ID = "text_messages";
    private static final String TAG_PREFIX = "text_message_";

    private TextMessageNotificationHelper() {}

    /** Ensure the FCM channel exists before the first push arrives (JS init can be delayed). */
    public static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Text Messages",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Text message alerts");
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    public static void clearDelivered(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return;
        }

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }

        for (StatusBarNotification status : manager.getActiveNotifications()) {
            if (!isTextMessageNotification(status)) {
                continue;
            }
            manager.cancel(status.getTag(), status.getId());
        }
    }

    private static boolean isTextMessageNotification(StatusBarNotification status) {
        if (status == null) {
            return false;
        }

        String tag = status.getTag();
        if (tag != null && tag.startsWith(TAG_PREFIX)) {
            return true;
        }

        Notification notification = status.getNotification();
        if (notification == null) {
            return false;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            String channelId = notification.getChannelId();
            if (CHANNEL_ID.equals(channelId)) {
                return true;
            }
        }

        Bundle extras = notification.extras;
        if (extras == null) {
            return false;
        }

        if ("text_message".equals(extras.getString("type"))) {
            return true;
        }

        for (String key : extras.keySet()) {
            if (key == null) {
                continue;
            }
            if (!key.endsWith("type")) {
                continue;
            }
            Object value = extras.get(key);
            if ("text_message".equals(String.valueOf(value))) {
                return true;
            }
        }

        return false;
    }
}
