package church.presencetorch.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;

/**
 * Foreground service that keeps relay PTT playback alive while the app is backgrounded.
 */
public class BackgroundAudioService extends Service {

    public static final String ACTION_START = "church.presencetorch.app.action.START_BACKGROUND_AUDIO";
    public static final String ACTION_UPDATE = "church.presencetorch.app.action.UPDATE_BACKGROUND_AUDIO";
    public static final String ACTION_STOP = "church.presencetorch.app.action.STOP_BACKGROUND_AUDIO";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_SILENT = "silent";

    private static final int NOTIFICATION_ID = 41001;
    private static final String CHANNEL_ID = "presence_torch_background_listen";
    private static final String CHANNEL_ID_SILENT = "presence_torch_background_listen_silent";
    private static final int SAMPLE_RATE = 44100;

    private static volatile boolean sessionActive = false;

    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private AudioManager.OnAudioFocusChangeListener audioFocusListener;
    private PowerManager.WakeLock wakeLock;
    private AudioTrack silentTrack;
    private boolean silentNotification = false;
    private String currentTitle;
    private String currentBody;

    public static boolean isSessionActive() {
        return sessionActive;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopForegroundSession();
            return START_NOT_STICKY;
        }

        if (ACTION_UPDATE.equals(action)) {
            if (!sessionActive) {
                return START_NOT_STICKY;
            }
            String title = intent.getStringExtra(EXTRA_TITLE);
            String body = intent.getStringExtra(EXTRA_BODY);
            if (title != null && !title.isEmpty()) {
                currentTitle = title;
            }
            if (body != null && !body.isEmpty()) {
                currentBody = body;
            }
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.notify(NOTIFICATION_ID, buildNotification(currentTitle));
            }
            return START_STICKY;
        }

        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        silentNotification = intent.getBooleanExtra(EXTRA_SILENT, false);
        if (title == null || title.isEmpty()) {
            title = getString(R.string.background_audio_default_title);
        }
        if (body == null || body.isEmpty()) {
            body = getString(R.string.background_audio_notification_text);
        }

        currentTitle = title;
        currentBody = body;
        startForegroundSession(title);
        return START_STICKY;
    }

    private void startForegroundSession(String title) {
        createNotificationChannel();
        acquireWakeLock();
        requestAudioFocus();
        startSilentLoop();

        Notification notification = buildNotification(title);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        sessionActive = true;
    }

    private void stopForegroundSession() {
        stopSilentLoop();
        abandonAudioFocus();
        releaseWakeLock();
        sessionActive = false;
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private Notification buildNotification(String title) {
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String channelId = silentNotification ? CHANNEL_ID_SILENT : CHANNEL_ID;
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pendingIntent)
            .setCategory(NotificationCompat.CATEGORY_SERVICE);

        if (silentNotification) {
            builder
                .setContentTitle("")
                .setContentText("")
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setSilent(true)
                .setShowWhen(false)
                .setVisibility(NotificationCompat.VISIBILITY_SECRET);
        } else {
            builder
                .setContentTitle(title)
                .setContentText(currentBody != null ? currentBody : getString(R.string.background_audio_notification_text))
                .setPriority(NotificationCompat.PRIORITY_LOW);
        }

        return builder.build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            silentNotification ? CHANNEL_ID_SILENT : CHANNEL_ID,
            getString(R.string.background_audio_channel_name),
            silentNotification ? NotificationManager.IMPORTANCE_MIN : NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription(getString(R.string.background_audio_channel_description));
        channel.setShowBadge(false);
        if (silentNotification) {
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.enableLights(false);
        }
        manager.createNotificationChannel(channel);
    }

    private void requestAudioFocus() {
        if (audioManager == null) {
            audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        }
        if (audioManager == null) {
            return;
        }

        if (audioFocusListener == null) {
            audioFocusListener = focusChange -> {};
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attrs)
                .setOnAudioFocusChangeListener(audioFocusListener)
                .setAcceptsDelayedFocusGain(true)
                .build();
            audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            audioManager.requestAudioFocus(
                audioFocusListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN
            );
        }
    }

    private void abandonAudioFocus() {
        if (audioManager == null) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
            audioFocusRequest = null;
        } else if (audioFocusListener != null) {
            audioManager.abandonAudioFocus(audioFocusListener);
        }
    }

    /**
     * Silent loop keeps the audio pipeline active while the screen is off (mirrors iOS plugin).
     */
    private void startSilentLoop() {
        stopSilentLoop();

        int minBufferSize = AudioTrack.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        );
        if (minBufferSize <= 0) {
            return;
        }

        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();
        AudioFormat format = new AudioFormat.Builder()
            .setSampleRate(SAMPLE_RATE)
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build();

        try {
            silentTrack = new AudioTrack.Builder()
                .setAudioAttributes(attrs)
                .setAudioFormat(format)
                .setTransferMode(AudioTrack.MODE_STATIC)
                .setBufferSizeInBytes(minBufferSize)
                .build();

            byte[] silence = new byte[minBufferSize];
            silentTrack.write(silence, 0, silence.length);
            silentTrack.setLoopPoints(0, minBufferSize / 2, -1);
            silentTrack.setVolume(0.001f);
            silentTrack.play();
        } catch (Exception ignored) {
            stopSilentLoop();
        }
    }

    private void stopSilentLoop() {
        if (silentTrack == null) {
            return;
        }
        try {
            if (silentTrack.getPlayState() == AudioTrack.PLAYSTATE_PLAYING) {
                silentTrack.stop();
            }
            silentTrack.release();
        } catch (Exception ignored) {
            /* ignore */
        }
        silentTrack = null;
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            return;
        }

        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager == null) {
            return;
        }

        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "PresenceTorch::BackgroundRelayListen"
        );
        wakeLock.acquire();
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
    }

    @Override
    public void onDestroy() {
        stopSilentLoop();
        abandonAudioFocus();
        releaseWakeLock();
        sessionActive = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
