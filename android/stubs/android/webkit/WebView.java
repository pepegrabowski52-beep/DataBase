package android.webkit;
public class WebView extends android.view.View {
    public WebView(android.content.Context context) { super(context); }
    public WebSettings getSettings() { throw new RuntimeException("Stub!"); }
    public void setWebViewClient(WebViewClient client) { throw new RuntimeException("Stub!"); }
    public void loadUrl(String url) { throw new RuntimeException("Stub!"); }
    public String getUrl() { throw new RuntimeException("Stub!"); }
    public boolean canGoBack() { throw new RuntimeException("Stub!"); }
    public void goBack() { throw new RuntimeException("Stub!"); }
    public void evaluateJavascript(String script, ValueCallback<String> resultCallback) { throw new RuntimeException("Stub!"); }
    public WebBackForwardList saveState(android.os.Bundle outState) { throw new RuntimeException("Stub!"); }
    public WebBackForwardList restoreState(android.os.Bundle inState) { throw new RuntimeException("Stub!"); }
}
