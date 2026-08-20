package church.presencetorch.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Fires after 6 hours in the background — notifies a live WebView to sign out via JS.
 * If the process was killed, auth init signs out on the next cold start from the stored timestamp.
 */
public class BackgroundLogoutReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        MainActivity.notifyBackgroundLogoutTimeout();
    }
}
