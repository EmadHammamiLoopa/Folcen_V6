package com.folcen.app;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
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

import java.util.ArrayList;
import java.util.List;
import java.lang.ref.WeakReference;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "FolcenMainActivity";
    private static final long INCOMING_URL_DEDUPE_MS = 45000L;
    private static boolean foreground = false;
    private static String lastIncomingCallUrl = "";
    private static long lastIncomingCallUrlAt = 0L;
    private static WeakReference<MainActivity> activeInstance =
            new WeakReference<>(null);

    public static boolean isInForeground() {
        return foreground;
    }

    public static void dispatchCallTerminalToWebView(
            String callId,
            String status,
            String type
    ) {
        MainActivity activity = activeInstance.get();

        if (
                activity == null ||
                !foreground ||
                activity.bridge == null
        ) {
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                JSONObject payload = new JSONObject();
                payload.put(
                        "callId",
                        callId == null ? "" : callId
                );
                payload.put(
                        "status",
                        status == null ? "" : status
                );
                payload.put(
                        "type",
                        type == null ? "" : type
                );

                activity.bridge.triggerWindowJSEvent(
                        "folcen-call-terminal",
                        payload.toString()
                );

                Log.d(
                        TAG,
                        "terminal call lifecycle dispatched to WebView callId="
                                + callId
                                + " status="
                                + status
                );

            } catch (Exception e) {
                Log.w(
                        TAG,
                        "Unable to dispatch terminal call lifecycle",
                        e
                );
            }
        });
    }

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        installFolcenWebChromeClient();
        ensureCallRuntimeCapabilities();
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
    }

    @Override
    public void onResume() {
        super.onResume();
        activeInstance = new WeakReference<>(this);
        foreground = true;
        dispatchIncomingCallIntent(getIntent());
    }

    @Override
    public void onPause() {
        foreground = false;
        super.onPause();
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
        /*
         * Do not dispatch the incoming-call event directly during
         * locked-screen/cold startup. Keep the Intent data intact so
         * @capacitor/app can deliver it through getLaunchUrl/appUrlOpen
         * after the WebView and Angular listeners are ready.
         */
        if (bridge != null) {
            Log.d(
                    TAG,
                    "incoming deeplink retained for Capacitor App plugin callId="
                            + callId
            );
        } else {
            Log.d(
                    TAG,
                    "incoming deeplink retained; bridge not ready yet callId="
                            + callId
            );
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
                    Log.d(TAG, "canUseFullScreenIntent=" + manager.canUseFullScreenIntent()
                            + " settingsAction=" + Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                } catch (Exception e) {
                    Log.w(TAG, "Unable to inspect full-screen intent capability", e);
                }
            }
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
}


