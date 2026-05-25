package com.folcen.app;

import android.content.res.Configuration;
import android.content.res.Resources;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

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
}

