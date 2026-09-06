package church.presencetorch.app;

import android.app.ActivityManager;
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
import android.support.v4.media.session.MediaSessionCompat;
import android.view.KeyEvent;
import androidx.core.app.NotificationCompat;

/**
 * Foreground service that keeps relay PTT playback alive while the app is backgrounded.
 */
public class BackgroundAudioService extends Service {

    public static final String ACTION_START = "church.presencetorch.app.action.START_BACKGROUND_AUDIO";
    public static final String ACTION_UPDATE = "church.presencetorch.app.action.UPDATE_BACKGROUND_AUDIO";
    public static final String ACTION_STOP = "church.presencetorch.app.action.STOP_BACKGROUND_AUDIO";
    public static final String ACTION_REPROMOTE = "church.presencetorch.app.action.REPROMOTE_BACKGROUND_AUDIO";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_SILENT = "silent";

    private static final int NOTIFICATION_ID = 41001;
    private static final int NOTIFICATION_DISMISS_REQUEST_CODE = 41002;
    private static final String CHANNEL_ID = "presence_torch_background_listen_v3";
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
    private MediaSessionCompat mediaSession;

    public static boolean isSessionActive() {
        return sessionActive;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopForegroundSession();
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_REPROMOTE.equals(action)) {
            if (!sessionActive) {
                return START_NOT_STICKY;
            }
            if (!isMainActivityTaskAlive()) {
                stopForegroundSession();
                return START_NOT_STICKY;
            }
            repromoteForegroundNotification();
            return START_NOT_STICKY;
        }

        if (ACTION_STOP.equals(action)) {
            // stopSession may be delivered as a foreground-service start on newer Android;
            // satisfy the FGS contract before tearing down if we never promoted.
            if (!sessionActive) {
                satisfyForegroundServiceRequirement();
            }
            stopForegroundSession();
            return START_NOT_STICKY;
        }

        if (ACTION_UPDATE.equals(action)) {
            if (!sessionActive) {
                return START_NOT_STICKY;
            }
            String title = intent.getStringExtra(EXTRA_TITLE);
            String body = intent.getStringExtra(EXTRA_BODY);
            if (intent.hasExtra(EXTRA_SILENT)) {
                silentNotification = intent.getBooleanExtra(EXTRA_SILENT, silentNotification);
            }
            if (title != null && !title.isEmpty()) {
                currentTitle = title;
            }
            if (body != null && !body.isEmpty()) {
                currentBody = body;
            }
            repromoteForegroundNotification();
            return START_NOT_STICKY;
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
        return START_NOT_STICKY;
    }

    private void startForegroundSession(String title) {
        createNotificationChannel();
        activateMediaButtonSession();
        promoteToForeground(title);
        acquireWakeLock();
        requestAudioFocus();
        startSilentLoop();
    }

    /** Must run before any slow setup when started via startForegroundService(). */
    private void promoteToForeground(String title) {
        repromoteForegroundNotification(title);
        sessionActive = true;
    }

    /** Re-post the FGS notification — required after user swipe on Android 13+. */
    private void repromoteForegroundNotification() {
        repromoteForegroundNotification(currentTitle);
    }

    private void repromoteForegroundNotification(String title) {
        createNotificationChannel();
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
    }

    private void satisfyForegroundServiceRequirement() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        String title = currentTitle;
        if (title == null || title.isEmpty()) {
            title = getString(R.string.background_audio_default_title);
        }
        if (currentBody == null || currentBody.isEmpty()) {
            currentBody = getString(R.string.background_audio_notification_text);
        }

        createNotificationChannel();
        promoteToForeground(title);
    }

    private void stopForegroundSession() {
        stopSilentLoop();
        abandonAudioFocus();
        releaseWakeLock();
        deactivateMediaButtonSession();
        sessionActive = false;
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    /** Route headset/media keys to HeadsetPTT while the listen session is foregrounded. */
    private void activateMediaButtonSession() {
        if (mediaSession == null) {
            mediaSession = new MediaSessionCompat(this, "PresenceTorchBackgroundListen");
            mediaSession.setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS
                    | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            );
            mediaSession.setCallback(
                new MediaSessionCompat.Callback() {
                    @Override
                    public boolean onMediaButtonEvent(Intent mediaButtonIntent) {
                        KeyEvent event = mediaButtonIntent.getParcelableExtra(
                            Intent.EXTRA_KEY_EVENT
                        );
                        if (event != null && HeadsetPTTPlugin.forwardKeyEvent(event)) {
                            return true;
                        }
                        return super.onMediaButtonEvent(mediaButtonIntent);
                    }
                }
            );
        }
        mediaSession.setActive(true);
    }

    private void deactivateMediaButtonSession() {
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
    }

    private Notification buildNotification(String title) {
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launchIntent == null) {
            launchIntent = new Intent(this, MainActivity.class);
            launchIntent.setAction(Intent.ACTION_MAIN);
            launchIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        }
        launchIntent.addFlags(
            Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        );
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            NOTIFICATION_ID,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String displayTitle = (title != null && !title.isEmpty())
            ? title
            : getString(R.string.background_audio_default_title);
        String displayBody = (currentBody != null && !currentBody.isEmpty())
            ? currentBody
            : getString(R.string.background_audio_notification_text);

        Intent dismissIntent = new Intent(this, BackgroundNotificationDismissReceiver.class);
        dismissIntent.setPackage(getPackageName());
        PendingIntent dismissPendingIntent = PendingIntent.getBroadcast(
            this,
            NOTIFICATION_DISMISS_REQUEST_CODE,
            dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(displayTitle)
            .setContentText(displayBody)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setContentIntent(pendingIntent)
            .setDeleteIntent(dismissPendingIntent)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        if (silentNotification) {
            builder
                .setSilent(true)
                .setShowWhen(false)
                .setPriority(NotificationCompat.PRIORITY_LOW);
        } else {
            builder.setPriority(NotificationCompat.PRIORITY_DEFAULT);
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
            CHANNEL_ID,
            getString(R.string.background_audio_channel_name),
            silentNotification ? NotificationManager.IMPORTANCE_LOW : NotificationManager.IMPORTANCE_DEFAULT
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
    public void onTimeout(int startId, int fgsType) {
        if (sessionActive && isMainActivityTaskAlive()) {
            repromoteForegroundNotification();
        } else if (sessionActive) {
            stopForegroundSession();
        }
    }

    @Override
    public void onDestroy() {
        stopSilentLoop();
        abandonAudioFocus();
        releaseWakeLock();
        deactivateMediaButtonSession();
        if (sessionActive) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        }
        sessionActive = false;
        super.onDestroy();
    }

    /** True when the launcher task for MainActivity still exists in recents. */
    private boolean isMainActivityTaskAlive() {
        if (MainActivity.isUiAlive()) {
            return true;
        }

        ActivityManager manager = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (manager == null) {
            return true;
        }
        try {
            for (ActivityManager.AppTask task : manager.getAppTasks()) {
                ActivityManager.RecentTaskInfo info = task.getTaskInfo();
                if (info == null || info.baseIntent == null || info.baseIntent.getComponent() == null) {
                    continue;
                }
                if (MainActivity.class.getName().equals(info.baseIntent.getComponent().getClassName())) {
                    return true;
                }
            }
        } catch (Exception ignored) {
            return true;
        }
        return false;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        if (SessionPrefs.shouldAllowSwipeAwayLogout(this)) {
            SessionPrefs.markForceLogoutOnNextStart(this);
        }
        stopForegroundSession();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
