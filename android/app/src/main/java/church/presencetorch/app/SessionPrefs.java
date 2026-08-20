package church.presencetorch.app;

import android.content.Context;

/** Native session flags — readable even when the WebView is paused during Google sign-in. */
public final class SessionPrefs {
    private static final String PREFS = "presence_session";
    private static final String KEY_GOOGLE_SIGNIN = "google_signin_pending";
    private static final String KEY_ACTIVE_SESSION = "active_session";

    private SessionPrefs() {}

    public static void setGoogleSignInPending(Context context, boolean pending) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_GOOGLE_SIGNIN, pending)
            .apply();
    }

    public static void setActiveSession(Context context, boolean active) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_ACTIVE_SESSION, active)
            .apply();
    }

    /** Immediate logout / background alarms only when a signed-in session exists and OAuth is idle. */
    public static boolean shouldAllowSessionLogout(Context context) {
        Context app = context.getApplicationContext();
        var prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (prefs.getBoolean(KEY_GOOGLE_SIGNIN, false)) {
            return false;
        }
        return prefs.getBoolean(KEY_ACTIVE_SESSION, false);
    }
}
