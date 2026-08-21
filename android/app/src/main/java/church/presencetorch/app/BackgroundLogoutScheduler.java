package church.presencetorch.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Schedules native idle sign-out at a JS-computed deadline. */
public final class BackgroundLogoutScheduler {
    private static final int REQUEST_CODE = 44006;

    private BackgroundLogoutScheduler() {}

    public static void scheduleAt(Context context, long triggerAtMs) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            return;
        }

        Intent intent = new Intent(context, BackgroundLogoutReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        if (triggerAtMs <= System.currentTimeMillis()) {
            alarmManager.cancel(pendingIntent);
            return;
        }

        scheduleAlarmSafely(alarmManager, triggerAtMs, pendingIntent);
    }

    private static void scheduleAlarmSafely(AlarmManager alarmManager, long triggerAtMs, PendingIntent pendingIntent) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                setInexactWhileIdle(alarmManager, triggerAtMs, pendingIntent);
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pendingIntent);
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMs, pendingIntent);
            }
        } catch (SecurityException ex) {
            try {
                setInexactWhileIdle(alarmManager, triggerAtMs, pendingIntent);
            } catch (SecurityException ignored) {
                // JS idle timer remains the fallback when exact alarms are unavailable.
            }
        }
    }

    private static void setInexactWhileIdle(
        AlarmManager alarmManager,
        long triggerAtMs,
        PendingIntent pendingIntent
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pendingIntent);
        } else {
            alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAtMs, pendingIntent);
        }
    }

    public static void cancel(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            return;
        }

        Intent intent = new Intent(context, BackgroundLogoutReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        alarmManager.cancel(pendingIntent);
    }
}
