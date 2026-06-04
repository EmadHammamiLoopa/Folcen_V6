package com.folcen.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class CallActionReceiver extends BroadcastReceiver {
    public static final String ACTION_REJECT_CALL = "com.folcen.app.REJECT_CALL";
    public static final String EXTRA_NOTIFICATION_ID = "notificationId";
    public static final String EXTRA_CALLER_ID = "callerId";
    public static final String EXTRA_CALL_ID = "callId";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_REJECT_CALL.equals(intent.getAction())) return;
        int notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null && notificationId != 0) {
            manager.cancel(notificationId);
        }
    }

    public static Intent rejectIntent(Context context, int notificationId, String callerId, String callId) {
        Intent intent = new Intent(context, CallActionReceiver.class);
        intent.setAction(ACTION_REJECT_CALL);
        intent.putExtra(EXTRA_NOTIFICATION_ID, notificationId);
        intent.putExtra(EXTRA_CALLER_ID, callerId);
        intent.putExtra(EXTRA_CALL_ID, callId);
        return intent;
    }
}
