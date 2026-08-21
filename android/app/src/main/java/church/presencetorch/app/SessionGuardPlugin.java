package church.presencetorch.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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
        SessionPrefs.setActiveSession(getContext(), active);
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
}
