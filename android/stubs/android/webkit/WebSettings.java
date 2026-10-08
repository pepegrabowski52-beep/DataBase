package android.webkit;
public abstract class WebSettings {
    public abstract void setJavaScriptEnabled(boolean flag);
    public abstract void setDomStorageEnabled(boolean flag);
    public abstract String getUserAgentString();
    public abstract void setUserAgentString(String ua);
}
