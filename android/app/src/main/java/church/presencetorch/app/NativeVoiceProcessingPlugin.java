package church.presencetorch.app;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.NoiseSuppressor;
import android.os.Build;
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
    private boolean voiceActive = false;
    private boolean listenActive = false;

    @PluginMethod
    public void enable(PluginCall call) {
        if (!applyCommunicationMode(true, listenActive)) {
            call.reject("AudioManager unavailable");
            return;
        }
        voiceActive = true;

        JSObject ret = new JSObject();
        ret.put("enabled", true);
        ret.put("noiseSuppressorAvailable", NoiseSuppressor.isAvailable());
        ret.put("aecAvailable", AcousticEchoCanceler.isAvailable());
        call.resolve(ret);
    }

    @PluginMethod
    public void disable(PluginCall call) {
        voiceActive = false;
        restoreIfIdle();
        call.resolve();
    }

    @PluginMethod
    public void prepareListen(PluginCall call) {
        if (!applyCommunicationMode(voiceActive, true)) {
            call.reject("AudioManager unavailable");
            return;
        }
        listenActive = true;
        JSObject ret = new JSObject();
        ret.put("prepared", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void releaseListen(PluginCall call) {
        listenActive = false;
        restoreIfIdle();
        call.resolve();
    }

    @PluginMethod
    public void refresh(PluginCall call) {
        if (voiceActive || listenActive) {
            applyCommunicationMode(voiceActive, listenActive);
        }
        JSObject ret = new JSObject();
        ret.put("refreshed", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", true);
        ret.put("noiseSuppressorAvailable", NoiseSuppressor.isAvailable());
        ret.put("aecAvailable", AcousticEchoCanceler.isAvailable());
        call.resolve(ret);
    }

    /** Wired headset or Bluetooth audio output (not BLE GATT PTT buttons). */
    @PluginMethod
    public void hasEarpieceConnected(PluginCall call) {
        AudioManager audioManager = getAudioManager();
        if (audioManager == null) {
            call.reject("AudioManager unavailable");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("connected", hasExternalAudioOutput(audioManager));
        call.resolve(ret);
    }

    private boolean applyCommunicationMode(boolean nextVoice, boolean nextListen) {
        AudioManager audioManager = getAudioManager();
        if (audioManager == null) {
            return false;
        }

        if (!voiceActive && !listenActive) {
            previousMode = audioManager.getMode();
        }

        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        applyPreferredOutputRoute(audioManager, nextVoice);
        voiceActive = nextVoice;
        listenActive = nextListen;
        return true;
    }

    /**
     * Keep earbuds / BT headsets on A2DP or HFP for listen + mic. Only fall back to the
     * loudspeaker when no wired or Bluetooth audio output is connected (BLE PTT buttons are
     * GATT-only and must not replace the communication device).
     */
    private void applyPreferredOutputRoute(AudioManager audioManager, boolean voiceCaptureActive) {
        if (hasExternalAudioOutput(audioManager)) {
            audioManager.setSpeakerphoneOn(false);
            return;
        }
        audioManager.setSpeakerphoneOn(voiceCaptureActive);
    }

    private boolean hasExternalAudioOutput(AudioManager audioManager) {
        if (audioManager.isWiredHeadsetOn()) {
            return true;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            AudioDeviceInfo[] outputs = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
            for (AudioDeviceInfo device : outputs) {
                switch (device.getType()) {
                    case AudioDeviceInfo.TYPE_WIRED_HEADSET:
                    case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
                    case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
                    case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
                    case AudioDeviceInfo.TYPE_USB_HEADSET:
                    case AudioDeviceInfo.TYPE_USB_DEVICE:
                    case AudioDeviceInfo.TYPE_HEARING_AID:
                        return true;
                    default:
                        break;
                }
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                for (AudioDeviceInfo device : outputs) {
                    int type = device.getType();
                    if (type == AudioDeviceInfo.TYPE_BLE_HEADSET
                        || type == AudioDeviceInfo.TYPE_BLE_SPEAKER) {
                        return true;
                    }
                }
            }
            return false;
        }
        return audioManager.isBluetoothA2dpOn() || audioManager.isBluetoothScoOn();
    }

    private void restoreIfIdle() {
        AudioManager audioManager = getAudioManager();
        if (audioManager != null && !voiceActive && !listenActive) {
            audioManager.setMode(previousMode);
        }
    }

    private AudioManager getAudioManager() {
        Context context = getContext();
        if (context == null) {
            return null;
        }
        return (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
    }
}
