package church.presencetorch.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Re-posts the listen-session foreground notification when the user swipes it away.
 * Required on Android 13+ where ongoing FGS notifications are dismissible.
 */
public class BackgroundNotificationDismissReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!BackgroundAudioService.isSessionActive()) {
            return;
        }

        Intent serviceIntent = new Intent(context, BackgroundAudioService.class);
        serviceIntent.setAction(BackgroundAudioService.ACTION_REPROMOTE);
        context.startService(serviceIntent);
    }
}
