package church.presencetorch.app;

import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.CookieManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BluetoothPermissionsPlugin.class);
        registerPlugin(HeadsetPTTPlugin.class);
        registerPlugin(BackgroundAudioPlugin.class);
        registerPlugin(SessionGuardPlugin.class);
        super.onCreate(savedInstanceState);
        activeInstance = this;
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(this::enableWebViewForRecaptcha);
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        keepWebViewAliveForBackgroundListen();
        if (!isFinishing() && SessionPrefs.shouldAllowSessionLogout(this)) {
            BackgroundLogoutScheduler.schedule(this);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        BackgroundLogoutScheduler.cancel(this);
        if (getBridge() != null && getBridge().getWebView() != null) {
            enableWebViewForRecaptcha();
        }
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
        triggerImmediateLogoutIfClosing();
        super.onDestroy();
    }

    @Override
    public void onStop() {
        if (isFinishing()) {
            BackgroundLogoutScheduler.cancel(this);
        }
        triggerImmediateLogoutIfClosing();
        super.onStop();
    }

    /** Swipe-away from recents — sign out while the WebView is still alive. */
    private void triggerImmediateLogoutIfClosing() {
        if (!isFinishing()) {
            return;
        }
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

    /**
     * Capacitor pauses the WebView on background, which stops relay/Agora audio with the screen off.
     * Counteract that while the foreground listen service is active.
     */
    private void keepWebViewAliveForBackgroundListen() {
        if (!BackgroundAudioService.isSessionActive()) {
            return;
        }
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }
        WebView webView = getBridge().getWebView();
        webView.onResume();
        webView.resumeTimers();
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
