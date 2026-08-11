package com.folcen.app;

import android.Manifest;
import android.app.NotificationManager;
import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Rational;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "FolcenMainActivity";
    private static final String TRACE_TAG = "FolcenCallTrace";
    private static final long INCOMING_URL_DEDUPE_MS = 45000L;
    private static boolean foreground = false;
    private static String lastIncomingCallUrl = "";
    private static long lastIncomingCallUrlAt = 0L;
    private static boolean lastIncomingCallDeliveredToWebView = false;

    public static boolean isInForeground() {
        return foreground;
    }

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        trace("main_on_create", getIntent() != null ? getIntent().getData() : null, "bridgeReady=" + (bridge != null));
        installFolcenWebChromeClient();
        ensureCallRuntimeCapabilities();
        dispatchIncomingCallIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        setIntent(intent);
        super.onNewIntent(intent);
        trace("main_on_new_intent", intent != null ? intent.getData() : null, "bridgeReady=" + (bridge != null));
        dispatchIncomingCallIntent(intent);
    }

    @Override
    public void onStart() {
        super.onStart();
    }

    @Override
    public void onResume() {
        super.onResume();
        foreground = true;
        Log.d(TAG, "app active/resumed; foreground=true");
        trace("main_on_resume", getIntent() != null ? getIntent().getData() : null, "bridgeReady=" + (bridge != null));
        dispatchIncomingCallIntent(getIntent());
    }

    @Override
    public void onPause() {
        foreground = false;
        Log.d(TAG, "app paused; foreground=false");
        super.onPause();
    }

    @Override
    public void onStop() {
        foreground = false;
        Log.d(TAG, "app stopped; foreground=false");
        super.onStop();
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        enterCallPictureInPictureIfNeeded();
    }

    private void enterCallPictureInPictureIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (isInPictureInPictureMode()) return;
        try {
            String currentUrl = bridge != null && bridge.getWebView() != null
                    ? bridge.getWebView().getUrl()
                    : "";
            if (currentUrl == null || !currentUrl.contains("/messages/video")) return;
            PictureInPictureParams params = new PictureInPictureParams.Builder()
                    .setAspectRatio(new Rational(9, 16))
                    .build();
            enterPictureInPictureMode(params);
            Log.d(TAG, "entered PiP for active call url=" + currentUrl);
        } catch (Exception e) {
            Log.w(TAG, "Unable to enter call PiP", e);
        }
    }

    private void dispatchIncomingCallIntent(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data == null) return;
        String url = data.toString();
        if (!url.startsWith("folcen://incoming-call")) return;
        String callId = data.getQueryParameter("callId");
        long dispatchAt = System.currentTimeMillis();
        trace("deeplink_dispatch_start", data, "foreground=" + foreground + " bridgeReady=" + (bridge != null));
        if (isExpiredIncomingCall(data)) {
            Log.d(TAG, "expired incoming deeplink ignored callId=" + callId + " url=" + url);
            trace("deeplink_expired_ignored", data, "");
            MyFirebaseMessagingService.cancelIncomingCallNotifications(this, callId, 0);
            try {
                getSharedPreferences("folcen_call", MODE_PRIVATE)
                        .edit()
                        .remove("pendingIncomingCallUrl")
                        .apply();
            } catch (Exception ignored) {}
            intent.setData(null);
            return;
        }
        long now = System.currentTimeMillis();
        if (url.equals(lastIncomingCallUrl) && now - lastIncomingCallUrlAt < INCOMING_URL_DEDUPE_MS) {
            if (lastIncomingCallDeliveredToWebView) {
                Log.d(TAG, "duplicate incoming deeplink ignored url=" + url);
                trace("deeplink_duplicate_ignored", data, "ageMs=" + (now - lastIncomingCallUrlAt));
                intent.setData(null);
                return;
            }
            Log.d(TAG, "duplicate incoming deeplink stored before WebView delivery url=" + url);
            trace("deeplink_duplicate_store_until_webview", data, "ageMs=" + (now - lastIncomingCallUrlAt));
            persistAndDispatchIncomingCallUrl(data, url, dispatchAt);
            intent.setData(null);
            return;
        }
        lastIncomingCallUrl = url;
        lastIncomingCallUrlAt = now;
        lastIncomingCallDeliveredToWebView = false;
        Log.d(TAG, "incoming deeplink received url=" + url);
        try {
            MyFirebaseMessagingService.cancelIncomingCallNotifications(this, callId, 0);
        } catch (Exception ignored) {}
        persistAndDispatchIncomingCallUrl(data, url, dispatchAt);
        intent.setData(null);
    }

    private void persistAndDispatchIncomingCallUrl(Uri data, String url, long dispatchAt) {
        try {
            getSharedPreferences("folcen_call", MODE_PRIVATE)
                    .edit()
                    .putString("pendingIncomingCallUrl", url)
                    .apply();
            trace("deeplink_stored_shared_preferences", data, "elapsedMs=" + (System.currentTimeMillis() - dispatchAt));
        } catch (Exception ignored) {}
        if (bridge != null) {
            try {
                String quotedUrl = JSONObject.quote(url);
                if (bridge.getWebView() != null) {
                    bridge.getWebView().post(() -> {
                        try {
                            trace("deeplink_eval_start", data, "elapsedMs=" + (System.currentTimeMillis() - dispatchAt));
                            bridge.getWebView().evaluateJavascript(
                                    "try{localStorage.setItem('pendingIncomingCallUrl'," + quotedUrl + ");" +
                                            "window.dispatchEvent(new CustomEvent('folcen-incoming-call',{detail:{url:" + quotedUrl + "}}));}catch(e){}",
                                    null
                            );
                            trace("deeplink_eval_called", data, "elapsedMs=" + (System.currentTimeMillis() - dispatchAt));
                            lastIncomingCallDeliveredToWebView = true;
                        } catch (Exception e) {
                            Log.w(TAG, "Unable to persist incoming call URL in WebView", e);
                            trace("deeplink_eval_failed", data, "error=" + e.getClass().getSimpleName() + ":" + e.getMessage());
                        }
                    });
                } else {
                    bridge.triggerWindowJSEvent("folcen-incoming-call", "{\"url\":" + quotedUrl + "}");
                    lastIncomingCallDeliveredToWebView = true;
                }
                Log.d(TAG, "incoming deeplink dispatched to WebView");
                trace("deeplink_trigger_window_event", data, "elapsedMs=" + (System.currentTimeMillis() - dispatchAt));
            } catch (Exception e) {
                Log.w(TAG, "Unable to dispatch incoming call URL to WebView", e);
                trace("deeplink_dispatch_failed", data, "error=" + e.getClass().getSimpleName() + ":" + e.getMessage());
            }
        } else {
            Log.d(TAG, "incoming deeplink stored; bridge not ready yet");
            trace("deeplink_bridge_not_ready", data, "elapsedMs=" + (System.currentTimeMillis() - dispatchAt));
        }
    }

    private boolean isExpiredIncomingCall(Uri data) {
        if (data == null) return false;
        String expiresAtValue = data.getQueryParameter("expiresAt");
        if (expiresAtValue == null || expiresAtValue.trim().length() == 0) return false;
        try {
            long expiresAt = Long.parseLong(expiresAtValue);
            return expiresAt > 0 && System.currentTimeMillis() > expiresAt;
        } catch (Exception ignored) {
            return false;
        }
    }
    /**
     * Lock the font scale to 1.0 so that Samsung / Android system "Large Font"
     * accessibility settings do not inflate the Ionic/WebView UI elements.
     * This makes the layout consistent across all devices regardless of the
     * user's system font-size preference.
     */
    @Override
    public Resources getResources() {
        Resources res = super.getResources();
        Configuration config = res.getConfiguration();
        if (config.fontScale != 1.0f) {
            config.fontScale = 1.0f;
            return createConfigurationContext(config).getResources();
        }
        return res;
    }

    private void ensureCallRuntimeCapabilities() {
        List<String> missing = new ArrayList<>();
        addMissingPermission(missing, Manifest.permission.CAMERA);
        addMissingPermission(missing, Manifest.permission.RECORD_AUDIO);
        if (Build.VERSION.SDK_INT >= 31) {
            addMissingPermission(missing, Manifest.permission.BLUETOOTH_CONNECT);
        }
        if (Build.VERSION.SDK_INT >= 33) {
            addMissingPermission(missing, Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!missing.isEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toArray(new String[0]), 4101);
        }

        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                try {
                    boolean canUseFullScreenIntent = manager.canUseFullScreenIntent();
                    Log.d(TAG, "canUseFullScreenIntent=" + canUseFullScreenIntent
                            + " settingsAction=" + Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                    if (!canUseFullScreenIntent && !isIncomingCallIntent(getIntent())) {
                        maybeOpenFullScreenIntentSettings();
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Unable to inspect full-screen intent capability", e);
                }
            }
        }
    }

    private boolean isIncomingCallIntent(Intent intent) {
        Uri data = intent != null ? intent.getData() : null;
        return data != null && data.toString().startsWith("folcen://incoming-call");
    }

    private void maybeOpenFullScreenIntentSettings() {
        try {
            boolean alreadyShown = getSharedPreferences("folcen_call", MODE_PRIVATE)
                    .getBoolean("fullScreenIntentSettingsShown", false);
            if (alreadyShown) return;
            getSharedPreferences("folcen_call", MODE_PRIVATE)
                    .edit()
                    .putBoolean("fullScreenIntentSettingsShown", true)
                    .apply();
            Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
            settingsIntent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(settingsIntent);
            Log.d(TAG, "Opened full-screen intent settings for call reliability");
        } catch (Exception e) {
            Log.w(TAG, "Unable to open full-screen intent settings", e);
        }
    }

    private void addMissingPermission(List<String> missing, String permission) {
        if (permission == null) return;
        if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
            missing.add(permission);
        }
    }

    private void installFolcenWebChromeClient() {
        try {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().setWebChromeClient(new FolcenWebChromeClient(bridge));
                Log.d(TAG, "Folcen WebChromeClient installed");
            }
        } catch (Exception e) {
            Log.w(TAG, "Unable to install Folcen WebChromeClient", e);
        }
    }

    private void trace(String event, Uri data, String details) {
        String callId = data != null ? data.getQueryParameter("callId") : "";
        String callerId = data != null ? firstNonEmpty(data.getQueryParameter("callerId"), data.getQueryParameter("fromUserId")) : "";
        String receiverId = data != null ? firstNonEmpty(data.getQueryParameter("receiverId"), data.getQueryParameter("toUserId")) : "";
        Log.d(TRACE_TAG, "native main event=" + event
                + " t=" + System.currentTimeMillis()
                + " callId=" + firstNonEmpty(callId, "")
                + " callerId=" + firstNonEmpty(callerId, "")
                + " receiverId=" + firstNonEmpty(receiverId, "")
                + " " + firstNonEmpty(details, ""));
    }

    private String firstNonEmpty(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && value.trim().length() > 0) return value;
        }
        return "";
    }
}
