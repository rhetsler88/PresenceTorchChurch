package church.presencetorch.app;

import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PttTones")
public class PttTonesPlugin extends Plugin {

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void playClearTone(PluginCall call) {
        mainHandler.post(() -> {
            playClearToneInternal(() -> call.resolve());
        });
    }

    @PluginMethod
    public void playBusyTone(PluginCall call) {
        mainHandler.post(() -> {
            playBusyToneInternal(() -> call.resolve());
        });
    }

    static void playClearToneInternal(Runnable onComplete) {
        Handler handler = new Handler(Looper.getMainLooper());
        ToneGenerator tone = new ToneGenerator(AudioManager.STREAM_MUSIC, 85);
        tone.startTone(ToneGenerator.TONE_PROP_ACK, 120);
        handler.postDelayed(() -> {
            tone.startTone(ToneGenerator.TONE_PROP_ACK, 120);
            handler.postDelayed(() -> {
                tone.release();
                if (onComplete != null) {
                    onComplete.run();
                }
            }, 140);
        }, 180);
    }

    static void playBusyToneInternal(Runnable onComplete) {
        Handler handler = new Handler(Looper.getMainLooper());
        ToneGenerator tone = new ToneGenerator(AudioManager.STREAM_MUSIC, 90);
        tone.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 600);
        handler.postDelayed(() -> {
            tone.release();
            if (onComplete != null) {
                onComplete.run();
            }
        }, 620);
    }
}
