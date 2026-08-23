package church.presencetorch.app;

import android.content.Context;
import android.media.AudioManager;
import android.support.v4.media.session.MediaSessionCompat;
import android.view.KeyEvent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HeadsetPTT")
public class HeadsetPTTPlugin extends Plugin {

    private static HeadsetPTTPlugin instance;

    private MediaSessionCompat mediaSession;
    private AudioManager audioManager;
    private AudioManager.OnAudioFocusChangeListener audioFocusListener;
    private boolean listening = false;
    private long lastDownEventTime = -1;
    private int lastDownKeyCode = -1;
    private long lastUpEventTime = -1;
    private int lastUpKeyCode = -1;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
        super.handleOnDestroy();
    }

    /** Forward media keys from the background listen foreground service. */
    public static boolean forwardKeyEvent(KeyEvent event) {
        HeadsetPTTPlugin plugin = instance;
        if (plugin != null && plugin.listening && event != null) {
            return plugin.handleKeyEvent(event);
        }
        return false;
    }

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
        int keyCode = event.getKeyCode();
        long eventTime = event.getEventTime();

        if (action == KeyEvent.ACTION_DOWN) {
            if (eventTime == lastDownEventTime && keyCode == lastDownKeyCode) {
                return true;
            }
            lastDownEventTime = eventTime;
            lastDownKeyCode = keyCode;
            notifyPttDown();
            notifyPttTap();
            return true;
        }

        if (action == KeyEvent.ACTION_UP) {
            if (eventTime == lastUpEventTime && keyCode == lastUpKeyCode) {
                return true;
            }
            lastUpEventTime = eventTime;
            lastUpKeyCode = keyCode;
            notifyPttUp();
            return true;
        }

        return false;
    }

    private boolean isHeadsetMediaKey(int keyCode) {
        return keyCode == KeyEvent.KEYCODE_HEADSETHOOK
            || keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
            || keyCode == KeyEvent.KEYCODE_MEDIA_PLAY
            || keyCode == KeyEvent.KEYCODE_MEDIA_PAUSE
            || keyCode == KeyEvent.KEYCODE_MEDIA_STOP
            || keyCode == KeyEvent.KEYCODE_MEDIA_NEXT
            || keyCode == KeyEvent.KEYCODE_MEDIA_PREVIOUS
            || keyCode == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD
            || keyCode == KeyEvent.KEYCODE_MEDIA_REWIND
            || isFunctionKey(keyCode);
    }

    private boolean isFunctionKey(int keyCode) {
        return keyCode >= KeyEvent.KEYCODE_F1 && keyCode <= KeyEvent.KEYCODE_F12;
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
    }

    private void notifyPttTap() {
        notifyListeners("pttTap", new JSObject());
    }

    private void notifyPttDown() {
        notifyListeners("pttDown", new JSObject());
    }

    private void notifyPttUp() {
        notifyListeners("pttUp", new JSObject());
    }
}
