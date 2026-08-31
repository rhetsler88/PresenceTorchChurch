package church.presencetorch.app;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;

/**
 * Detects swipe-away from recents via {@link #onTaskRemoved(Intent)} and marks a
 * durable native logout flag before the WebView is torn down.
 */
public class SessionTaskService extends Service {
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        if (SessionPrefs.shouldAllowSwipeAwayLogout(this)) {
            SessionPrefs.markForceLogoutOnNextStart(this);
        }
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
