package church.presencetorch.app;

import android.Manifest;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "MicrophonePermissions",
    permissions = {
        @Permission(
            alias = "microphone",
            strings = { Manifest.permission.RECORD_AUDIO }
        )
    }
)
public class MicrophonePermissionsPlugin extends Plugin {

    @PluginMethod
    public void request(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            call.resolve();
            return;
        }
        requestPermissionForAlias("microphone", call, "permissionsCallback");
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            call.resolve();
        } else {
            call.reject("Microphone permission denied");
        }
    }
}
