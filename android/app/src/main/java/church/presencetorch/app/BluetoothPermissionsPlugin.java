package church.presencetorch.app;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "BluetoothPermissions",
    permissions = {
        @Permission(
            alias = "bluetooth",
            strings = {
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT
            }
        ),
        @Permission(
            alias = "location",
            strings = { Manifest.permission.ACCESS_FINE_LOCATION }
        )
    }
)
public class BluetoothPermissionsPlugin extends Plugin {

    @PluginMethod
    public void request(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (hasBluetoothPermissions()) {
                call.resolve();
                return;
            }
            requestPermissionForAlias("bluetooth", call, "permissionsCallback");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (getPermissionState("location") == PermissionState.GRANTED) {
                call.resolve();
                return;
            }
            requestPermissionForAlias("location", call, "permissionsCallback");
            return;
        }

        call.resolve();
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (hasBluetoothPermissions()) {
                call.resolve();
            } else {
                call.reject("Bluetooth permissions denied");
            }
            return;
        }

        if (getPermissionState("location") == PermissionState.GRANTED) {
            call.resolve();
        } else {
            call.reject("Location permission is required for Bluetooth on this device");
        }
    }

    private boolean hasBluetoothPermissions() {
        return getPermissionState("bluetooth") == PermissionState.GRANTED;
    }
}
