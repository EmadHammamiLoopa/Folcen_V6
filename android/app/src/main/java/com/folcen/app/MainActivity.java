package com.folcen.app;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "FolcenMainActivity";
    private static final long INCOMING_URL_DEDUPE_MS = 45000L;
    private static boolean foreground = false;
    private static String lastIncomingCallUrl = "";
    private static long lastIncomingCallUrlAt = 0L;

    public static boolean isInForeground() {
        return foreground;
    }

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        installFolcenWebChromeClient();
        ensureNotificationCapabilities();
        dispatchIncomingCallIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        setIntent(intent);
        super.onNewIntent(intent);
        dispatchIncomingCallIntent(intent);
    }

    @Override
    public void onStart() {
        super.onStart();
        foreground = true;
    }

    @Override
    public void onResume() {
        super.onResume();
        dispatchIncomingCallIntent(getIntent());
    }

    @Override
    public void onStop() {
        foreground = false;
        super.onStop();
    }

    private void dispatchIncomingCallIntent(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data == null) return;
        String url = data.toString();
        if (!url.startsWith("folcen://incoming-call")) return;
        String callId = data.getQueryParameter("callId");
        if (isExpiredIncomingCall(data)) {
            Log.d(TAG, "expired incoming deeplink ignored callId=" + callId + " url=" + url);
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
            Log.d(TAG, "duplicate incoming deeplink ignored url=" + url);
            return;
        }
        lastIncomingCallUrl = url;
        lastIncomingCallUrlAt = now;
        Log.d(TAG, "incoming deeplink received url=" + url);
        try {
            MyFirebaseMessagingService.cancelIncomingCallNotifications(this, callId, 0);
        } catch (Exception ignored) {}
        try {
            getSharedPreferences("folcen_call", MODE_PRIVATE)
                    .edit()
                    .putString("pendingIncomingCallUrl", url)
                    .apply();
        } catch (Exception ignored) {}
        if (bridge != null) {
            try {
                bridge.triggerWindowJSEvent("folcen-incoming-call", "{\"url\":" + JSONObject.quote(url) + "}");
                Log.d(TAG, "incoming deeplink dispatched to WebView");
            } catch (Exception e) {
                Log.w(TAG, "Unable to dispatch incoming call URL to WebView", e);
            }
        } else {
            Log.d(TAG, "incoming deeplink stored; bridge not ready yet");
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

    private void ensureNotificationCapabilities() {
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[] { Manifest.permission.POST_NOTIFICATIONS }, 4101);
        }

        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                try {
                    Log.d(TAG, "canUseFullScreenIntent=" + manager.canUseFullScreenIntent()
                            + " settingsAction=" + Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                } catch (Exception e) {
                    Log.w(TAG, "Unable to inspect full-screen intent capability", e);
                }
            }
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
}


