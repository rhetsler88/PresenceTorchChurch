package church.presencetorch.app;

import android.content.Intent;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.CookieManager;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        if (SessionPrefs.consumeUncleanBackgroundExit(this)) {
            SessionPrefs.markForceLogoutOnNextStart(this);
        }
        registerPlugin(BluetoothPermissionsPlugin.class);
        registerPlugin(HeadsetPTTPlugin.class);
        registerPlugin(BackgroundAudioPlugin.class);
        registerPlugin(SessionGuardPlugin.class);
        registerPlugin(MicrophonePermissionsPlugin.class);
        registerPlugin(NativeVoiceProcessingPlugin.class);
        super.onCreate(savedInstanceState);
        activeInstance = this;
        TextMessageNotificationHelper.ensureChannel(this);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(this::enableWebViewForRecaptcha);
        }
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        refreshWebViewAfterResume();
    }

    @Override
    protected void onStart() {
        super.onStart();
        activeInstance = this;
    }

    @Override
    public void onPause() {
        dispatchWebLifecycleEvent("pause");
        if (!isFinishing() && SessionPrefs.shouldAllowSwipeAwayLogout(this)) {
            SessionPrefs.markSessionBackgrounded(this);
            long deadline = SessionPrefs.getIdleLogoutDeadlineMs(this);
            if (deadline > System.currentTimeMillis()) {
                BackgroundLogoutScheduler.scheduleAt(this, deadline);
            }
        }
        super.onPause();
    }

    @Override
    public void onResume() {
        super.onResume();
        BackgroundLogoutScheduler.cancel(this);
        SessionPrefs.clearSessionBackgrounded(this);
        TextMessageNotificationHelper.clearDelivered(this);
        reinforceBackgroundListenNotification();
        refreshWebViewAfterResume();
    }

    /** Fold/unfold and cover-display moves — let the OS resize the window, then reflow the WebView. */
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        refreshWebViewAfterDisplayChange();
    }

    /** Restore the listen-session notification if the user swiped it away on Android 13+. */
    private void reinforceBackgroundListenNotification() {
        if (!BackgroundAudioService.isSessionActive()) {
            return;
        }
        Intent intent = new Intent(this, BackgroundAudioService.class);
        intent.setAction(BackgroundAudioService.ACTION_REPROMOTE);
        startService(intent);
    }

    /** Called from {@link BackgroundLogoutReceiver} after 6h background timeout. */
    public static void notifyBackgroundLogoutTimeout() {
        MainActivity activity = activeInstance;
        if (activity == null) {
            return;
        }
        activity.runImmediateLogoutOnWebView();
    }

    private static MainActivity activeInstance;

    public static boolean isUiAlive() {
        return activeInstance != null;
    }

    private void refreshWebViewAfterResume() {
        refreshWebViewAfterDisplayChange();
    }

    private void refreshWebViewAfterDisplayChange() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            return;
        }

        enableWebViewForRecaptcha();
        webView.onResume();
        webView.resumeTimers();

        webView.post(() -> {
            webView.invalidate();
            if (webView.getParent() instanceof android.view.View) {
                ((android.view.View) webView.getParent()).invalidate();
            }
            getWindow().getDecorView().requestLayout();
            dispatchWebLifecycleEvent("resume");
        });
    }

    private void dispatchWebLifecycleEvent(String eventName) {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            return;
        }

        webView.evaluateJavascript(
            "(function(){"
                + "try {"
                + "window.dispatchEvent(new Event('" + eventName + "'));"
                + ( "resume".equals(eventName)
                    ? "window.dispatchEvent(new Event('resize'));"
                    : "" )
                + "} catch (e) {}"
                + "})();",
            null
        );
    }

    private void runImmediateLogoutOnWebView() {
        if (!SessionPrefs.shouldAllowSessionLogout(this)) {
            return;
        }
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }
        getBridge().getWebView().evaluateJavascript(
            "window.__ptcImmediateLogout && window.__ptcImmediateLogout()",
            null
        );
    }

    @Override
    public void onDestroy() {
        if (activeInstance == this) {
            activeInstance = null;
        }
        stopBackgroundListenIfFinishing();
        triggerImmediateLogoutIfClosing();
        super.onDestroy();
    }

    @Override
    public void onStop() {
        if (isFinishing()) {
            BackgroundLogoutScheduler.cancel(this);
            stopBackgroundListenIfFinishing();
        }
        triggerImmediateLogoutIfClosing();
        super.onStop();
    }

    /** Prevent orphan listen notifications when the UI task is finishing. */
    private void stopBackgroundListenIfFinishing() {
        if (!isFinishing() || !BackgroundAudioService.isSessionActive()) {
            return;
        }
        Intent intent = new Intent(this, BackgroundAudioService.class);
        intent.setAction(BackgroundAudioService.ACTION_STOP);
        startService(intent);
    }

    /** Swipe-away from recents — sign out while the WebView is still alive. */
    private void triggerImmediateLogoutIfClosing() {
        if (!isFinishing()) {
            return;
        }
        if (!SessionPrefs.shouldAllowSwipeAwayLogout(this)) {
            return;
        }
        SessionPrefs.markForceLogoutOnNextStart(this);
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }
        getBridge().getWebView().evaluateJavascript(
            "window.__ptcImmediateLogout && window.__ptcImmediateLogout()",
            null
        );
    }

    private void enableWebViewForRecaptcha() {
        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setUseWideViewPort(true);
        webView.getSettings().setLoadWithOverviewMode(true);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        HeadsetPTTPlugin plugin = getHeadsetPTTPlugin();
        if (plugin != null && plugin.dispatchKeyEvent(event)) {
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    private HeadsetPTTPlugin getHeadsetPTTPlugin() {
        if (getBridge() == null) {
            return null;
        }
        PluginHandle handle = getBridge().getPlugin("HeadsetPTT");
        if (handle == null || handle.getInstance() == null) {
            return null;
        }
        Object instance = handle.getInstance();
        if (instance instanceof HeadsetPTTPlugin) {
            return (HeadsetPTTPlugin) instance;
        }
        return null;
    }
}
