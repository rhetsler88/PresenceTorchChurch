package church.presencetorch.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.StatusBarNotification;
import android.content.Context;
import android.os.Build;

/** Clears delivered text-message push notifications (not the background listen FGS). */
public final class TextMessageNotificationHelper {
    public static final String CHANNEL_ID = "text_messages";

    private TextMessageNotificationHelper() {}

    public static void clearDelivered(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return;
        }

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }

        for (StatusBarNotification status : manager.getActiveNotifications()) {
            Notification notification = status.getNotification();
            if (notification == null) {
                continue;
            }

            String channelId = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? notification.getChannelId()
                : null;
            if (!CHANNEL_ID.equals(channelId)) {
                continue;
            }

            manager.cancel(status.getTag(), status.getId());
        }
    }
}
