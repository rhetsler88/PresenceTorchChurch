package church.presencetorch.app;

import android.content.Context;
import android.media.AudioManager;
import androidx.media.session.MediaSessionCompat;
import android.view.KeyEvent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HeadsetPTT")
public class HeadsetPTTPlugin extends Plugin {

    private MediaSessionCompat mediaSession;
    private AudioManager audioManager;
    private AudioManager.OnAudioFocusChangeListener audioFocusListener;
    private boolean listening = false;
    private boolean pttHeld = false;

    @PluginMethod
    public void startListening(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            activateMediaSession();
            listening = true;
            call.resolve();
        });
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            listening = false;
            pttHeld = false;
            deactivateMediaSession();
            call.resolve();
        });
    }

    public boolean dispatchKeyEvent(KeyEvent event) {
        if (!listening) {
            return false;
        }
        return handleKeyEvent(event);
    }

    private boolean handleKeyEvent(KeyEvent event) {
        if (!isHeadsetMediaKey(event.getKeyCode())) {
            return false;
        }

        int action = event.getAction();
        if (action == KeyEvent.ACTION_DOWN) {
            if (!pttHeld) {
                pttHeld = true;
                notifyPttDown();
            }
            return true;
        }

        if (action == KeyEvent.ACTION_UP) {
            if (pttHeld) {
                pttHeld = false;
                notifyPttUp();
            }
            return true;
        }

        return false;
    }

    private boolean isHeadsetMediaKey(int keyCode) {
        return keyCode == KeyEvent.KEYCODE_HEADSETHOOK
            || keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
            || keyCode == KeyEvent.KEYCODE_MEDIA_PLAY
            || keyCode == KeyEvent.KEYCODE_MEDIA_PAUSE
            || keyCode == KeyEvent.KEYCODE_MEDIA_STOP;
    }

    private void activateMediaSession() {
        Context context = getContext();
        if (context == null) {
            return;
        }

        if (audioManager == null) {
            audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        }

        if (audioFocusListener == null) {
            audioFocusListener = focusChange -> {};
        }

        audioManager.requestAudioFocus(
            audioFocusListener,
            AudioManager.STREAM_VOICE_CALL,
            AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
        );

        if (mediaSession == null) {
            mediaSession = new MediaSessionCompat(context, "HeadsetPTT");
            mediaSession.setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS
                    | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            );
            mediaSession.setCallback(
                new MediaSessionCompat.Callback() {
                    @Override
                    public boolean onMediaButtonEvent(android.content.Intent mediaButtonIntent) {
                        KeyEvent event = mediaButtonIntent.getParcelableExtra(
                            android.content.Intent.EXTRA_KEY_EVENT
                        );
                        if (event == null) {
                            return super.onMediaButtonEvent(mediaButtonIntent);
                        }
                        return handleKeyEvent(event) || super.onMediaButtonEvent(mediaButtonIntent);
                    }
                }
            );
        }

        mediaSession.setActive(true);
    }

    private void deactivateMediaSession() {
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }

        if (audioManager != null && audioFocusListener != null) {
            audioManager.abandonAudioFocus(audioFocusListener);
        }
    }

    private void notifyPttDown() {
        notifyListeners("pttDown", new JSObject());
    }

    private void notifyPttUp() {
        notifyListeners("pttUp", new JSObject());
    }
}
