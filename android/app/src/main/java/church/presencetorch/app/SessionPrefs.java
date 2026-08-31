package church.presencetorch.app;

import android.content.Context;

/** Native session flags — readable even when the WebView is paused during Google sign-in. */
public final class SessionPrefs {
    private static final String PREFS = "presence_session";
    private static final String KEY_GOOGLE_SIGNIN = "google_signin_pending";
    private static final String KEY_ACTIVE_SESSION = "active_session";
    private static final String KEY_SENSITIVE_OPERATION = "sensitive_operation_pending";
    private static final String KEY_IDLE_LOGOUT_DEADLINE = "idle_logout_deadline_ms";
    private static final String KEY_FORCE_LOGOUT = "force_logout_on_next_start";
    private static final String KEY_SESSION_BACKGROUNDED = "session_backgrounded_with_active_session";

    private SessionPrefs() {}

    public static void setGoogleSignInPending(Context context, boolean pending) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_GOOGLE_SIGNIN, pending)
            .apply();
    }

    public static void setActiveSession(Context context, boolean active) {
        context.getApplicationContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_ACTIVE_SESSION, active)
            .commit();
    }

    public static void setSensitiveOperationPending(Context context, boolean pending) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_SENSITIVE_OPERATION, pending)
            .apply();
    }

    public static void setIdleLogoutDeadlineMs(Context context, long deadlineMs) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_IDLE_LOGOUT_DEADLINE, deadlineMs)
            .apply();
    }

    public static long getIdleLogoutDeadlineMs(Context context) {
        return context.getApplicationContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getLong(KEY_IDLE_LOGOUT_DEADLINE, 0L);
    }

    /** Durable swipe-away / kill flag — survives WebView teardown and backup restore checks. */
    public static void markForceLogoutOnNextStart(Context context) {
        context.getApplicationContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_FORCE_LOGOUT, true)
            .putBoolean(KEY_ACTIVE_SESSION, false)
            .putLong(KEY_IDLE_LOGOUT_DEADLINE, 0L)
            .commit();
    }

    public static boolean consumeForceLogoutOnNextStart(Context context) {
        var prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_FORCE_LOGOUT, false)) {
            return false;
        }
        prefs.edit()
            .remove(KEY_FORCE_LOGOUT)
            .putBoolean(KEY_ACTIVE_SESSION, false)
            .commit();
        return true;
    }

    public static void clearForceLogoutOnNextStart(Context context) {
        context.getApplicationContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_FORCE_LOGOUT)
            .commit();
    }

    /** Set when the app backgrounds with a live session; cleared on a normal foreground return. */
    public static void markSessionBackgrounded(Context context) {
        context.getApplicationContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_SESSION_BACKGROUNDED, true)
            .commit();
    }

    public static void clearSessionBackgrounded(Context context) {
        context.getApplicationContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_SESSION_BACKGROUNDED)
            .commit();
    }

    /**
     * App was backgrounded and relaunched without a clean foreground return (swipe-away / kill).
     */
    public static boolean consumeUncleanBackgroundExit(Context context) {
        var prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_SESSION_BACKGROUNDED, false)) {
            return false;
        }
        prefs.edit()
            .remove(KEY_SESSION_BACKGROUNDED)
            .commit();
        return true;
    }

    /** Immediate logout / background alarms only when a signed-in session exists and OAuth is idle. */
    public static boolean shouldAllowSessionLogout(Context context) {
        return shouldAllowSwipeAwayLogout(context);
    }

    /** Swipe-away logout when signed in, passively listening, or a force-logout is already pending. */
    public static boolean shouldAllowSwipeAwayLogout(Context context) {
        Context app = context.getApplicationContext();
        var prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (prefs.getBoolean(KEY_SENSITIVE_OPERATION, false)) {
            return false;
        }
        if (prefs.getBoolean(KEY_GOOGLE_SIGNIN, false)) {
            return false;
        }
        if (prefs.getBoolean(KEY_FORCE_LOGOUT, false)) {
            return true;
        }
        if (prefs.getBoolean(KEY_ACTIVE_SESSION, false)) {
            return true;
        }
        return BackgroundAudioService.isSessionActive();
    }
}
