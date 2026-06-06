package com.folcen.app;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
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

public class MainActivity extends BridgeActivity {
    private static final String TAG = "FolcenMainActivity";
    private static boolean foreground = false;

    public static boolean isInForeground() {
        return foreground;
    }

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ensureNotificationCapabilities();
    }

    @Override
    public void onStart() {
        super.onStart();
        foreground = true;
    }

    @Override
    public void onStop() {
        foreground = false;
        super.onStop();
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
}
