package church.presencetorch.app;

import android.content.Context;
import android.media.AudioManager;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.NoiseSuppressor;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Configures Android for voice communication before WebView getUserMedia.
 * MODE_IN_COMMUNICATION routes mic capture through the platform voice path
 * (NoiseSuppressor / AEC when the WebRTC stack uses VOICE_COMMUNICATION).
 */
@CapacitorPlugin(name = "NativeVoiceProcessing")
public class NativeVoiceProcessingPlugin extends Plugin {

    private int previousMode = AudioManager.MODE_NORMAL;
    private boolean sessionActive = false;

    @PluginMethod
    public void enable(PluginCall call) {
        AudioManager audioManager = getAudioManager();
        if (audioManager == null) {
            call.reject("AudioManager unavailable");
            return;
        }

        if (!sessionActive) {
            previousMode = audioManager.getMode();
        }

        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        audioManager.setSpeakerphoneOn(true);
        sessionActive = true;

        JSObject ret = new JSObject();
        ret.put("enabled", true);
        ret.put("noiseSuppressorAvailable", NoiseSuppressor.isAvailable());
        ret.put("aecAvailable", AcousticEchoCanceler.isAvailable());
        call.resolve(ret);
    }

    @PluginMethod
    public void disable(PluginCall call) {
        AudioManager audioManager = getAudioManager();
        if (audioManager != null && sessionActive) {
            audioManager.setMode(previousMode);
        }
        sessionActive = false;
        call.resolve();
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", true);
        ret.put("noiseSuppressorAvailable", NoiseSuppressor.isAvailable());
        ret.put("aecAvailable", AcousticEchoCanceler.isAvailable());
        call.resolve(ret);
    }

    private AudioManager getAudioManager() {
        Context context = getContext();
        if (context == null) {
            return null;
        }
        return (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
    }
}
