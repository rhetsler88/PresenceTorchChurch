package church.presencetorch.app;

import android.content.Intent;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BackgroundAudio")
public class BackgroundAudioPlugin extends Plugin {

    @PluginMethod
    public void startSession(PluginCall call) {
        String title = call.getString("title", "Presence Torch");
        String body = call.getString("body", "1 channel active");
        boolean silent = call.getBoolean("silent", false);

        Intent intent = new Intent(getContext(), BackgroundAudioService.class);
        intent.setAction(BackgroundAudioService.ACTION_START);
        intent.putExtra(BackgroundAudioService.EXTRA_TITLE, title);
        intent.putExtra(BackgroundAudioService.EXTRA_BODY, body);
        intent.putExtra(BackgroundAudioService.EXTRA_SILENT, silent);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(
                getActivity() != null ? getActivity() : getContext(),
                intent
            );
        } else {
            getContext().startService(intent);
        }

        call.resolve();
    }

    @PluginMethod
    public void updateSession(PluginCall call) {
        String title = call.getString("title", "Presence Torch");
        String body = call.getString("body", "1 channel active");
        boolean silent = call.getBoolean("silent", false);

        Intent intent = new Intent(getContext(), BackgroundAudioService.class);
        intent.setAction(BackgroundAudioService.ACTION_UPDATE);
        intent.putExtra(BackgroundAudioService.EXTRA_TITLE, title);
        intent.putExtra(BackgroundAudioService.EXTRA_BODY, body);
        intent.putExtra(BackgroundAudioService.EXTRA_SILENT, silent);
        getContext().startService(intent);

        call.resolve();
    }

    @PluginMethod
    public void stopSession(PluginCall call) {
        Intent intent = new Intent(getContext(), BackgroundAudioService.class);
        if (!BackgroundAudioService.isSessionActive()) {
            getContext().stopService(intent);
            call.resolve();
            return;
        }

        intent.setAction(BackgroundAudioService.ACTION_STOP);
        getContext().startService(intent);
        call.resolve();
    }
}
