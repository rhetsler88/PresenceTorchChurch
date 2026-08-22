package church.presencetorch.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;

@CapacitorPlugin(name = "SessionGuard")
public class SessionGuardPlugin extends Plugin {

    @PluginMethod
    public void setGoogleSignInPending(PluginCall call) {
        boolean pending = call.getBoolean("pending", false);
        SessionPrefs.setGoogleSignInPending(getContext(), pending);
        call.resolve();
    }

    @PluginMethod
    public void setActiveSession(PluginCall call) {
        boolean active = call.getBoolean("active", false);
        Context context = getContext();
        SessionPrefs.setActiveSession(context, active);
        Intent intent = new Intent(context, SessionTaskService.class);
        if (active) {
            context.startService(intent);
        } else {
            context.stopService(intent);
            SessionPrefs.clearForceLogoutOnNextStart(context);
        }
        call.resolve();
    }

    @PluginMethod
    public void setSensitiveOperationPending(PluginCall call) {
        boolean pending = call.getBoolean("pending", false);
        SessionPrefs.setSensitiveOperationPending(getContext(), pending);
        call.resolve();
    }

    @PluginMethod
    public void setIdleLogoutDeadline(PluginCall call) {
        Long deadlineMs = call.getLong("deadlineMs");
        long deadline = deadlineMs != null ? deadlineMs : 0L;
        SessionPrefs.setIdleLogoutDeadlineMs(getContext(), deadline);
        if (deadline > System.currentTimeMillis()) {
            BackgroundLogoutScheduler.scheduleAt(getContext(), deadline);
        } else {
            BackgroundLogoutScheduler.cancel(getContext());
        }
        call.resolve();
    }

    @PluginMethod
    public void consumeForceLogoutOnNextStart(PluginCall call) {
        boolean pending = SessionPrefs.consumeForceLogoutOnNextStart(getContext());
        call.resolve(new com.getcapacitor.JSObject().put("pending", pending));
    }

    @PluginMethod
    public void revokeGoogleSignInSession(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        GoogleSignInOptions options = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(getContext().getString(R.string.default_web_client_id))
            .requestEmail()
            .build();
        GoogleSignInClient client = GoogleSignIn.getClient(activity, options);
        client.signOut().addOnCompleteListener(task -> call.resolve());
    }

    @PluginMethod
    public void clearTextMessageNotifications(PluginCall call) {
        TextMessageNotificationHelper.clearDelivered(getContext());
        call.resolve();
    }
}
