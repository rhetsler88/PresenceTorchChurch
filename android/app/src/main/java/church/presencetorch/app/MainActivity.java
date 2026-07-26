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
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(this::enableWebViewForRecaptcha);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        if (getBridge() != null && getBridge().getWebView() != null) {
            enableWebViewForRecaptcha();
        }
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
