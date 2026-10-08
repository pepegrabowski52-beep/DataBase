package io.github.pepegrabowski52.fundus;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Zeigt den Fundus-Shop im Vollbild. Nach dem ersten Start hält der Service Worker
 * der Seite alles offline bereit; ohne Netz beim allerersten Start springt die
 * mitgelieferte Kopie aus den Assets ein.
 */
public class MainActivity extends Activity {
    private static final String HOME = "https://pepegrabowski52-beep.github.io/DataBase/";
    private static final String OFFLINE = "file:///android_asset/index.html";

    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(0xFFF2F4F1);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setUserAgentString(settings.getUserAgentString() + " FundusApp/1.0");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String url = uri.toString();
                if (url.startsWith(HOME) || url.startsWith("file:///android_asset/")) return false;
                // Fremde Links im Browser öffnen
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception e) {
                    // kein Browser installiert
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && request.getUrl().toString().startsWith("http")) {
                    view.loadUrl(OFFLINE);
                }
            }
        });

        setContentView(web);
        if (state == null || web.restoreState(state) == null) web.loadUrl(HOME);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        // Zuerst offene Fenster der Seite schließen (Warenkorb, Details, ...)
        web.evaluateJavascript("(window.fundusBack && window.fundusBack()) ? 'closed' : 'none'",
            new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String value) {
                    if (value != null && value.contains("closed")) return;
                    if (web.canGoBack()) web.goBack();
                    else moveTaskToBack(true);
                }
            });
    }
}
