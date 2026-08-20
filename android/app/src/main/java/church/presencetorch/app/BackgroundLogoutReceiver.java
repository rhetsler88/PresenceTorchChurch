package church.presencetorch.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import com.google.firebase.auth.FirebaseAuth;

/**
 * Fires after 6 hours in the background — signs out natively and notifies a live WebView if present.
 */
public class BackgroundLogoutReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            FirebaseAuth.getInstance().signOut();
        } catch (Exception ignored) {
            // Best effort — JS layer also signs out when the WebView is alive.
        }
        MainActivity.notifyBackgroundLogoutTimeout();
    }
}
