package com.folcen.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

public class CallActionReceiver extends BroadcastReceiver {
    public static final String ACTION_ANSWER_CALL = "com.folcen.app.ANSWER_CALL";
    public static final String ACTION_REJECT_CALL = "com.folcen.app.REJECT_CALL";
    public static final String EXTRA_NOTIFICATION_ID = "notificationId";
    public static final String EXTRA_CALLER_ID = "callerId";
    public static final String EXTRA_CALL_ID = "callId";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (!ACTION_REJECT_CALL.equals(action) && !ACTION_ANSWER_CALL.equals(action)) return;
        int notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null && notificationId != 0) {
            manager.cancel(notificationId);
        }
        String callerId = intent.getStringExtra(EXTRA_CALLER_ID);
        String callId = intent.getStringExtra(EXTRA_CALL_ID);
        Uri uri = new Uri.Builder()
                .scheme("folcen")
                .authority("incoming-call")
                .appendQueryParameter("callerId", callerId != null ? callerId : "")
                .appendQueryParameter("fromUserId", callerId != null ? callerId : "")
                .appendQueryParameter("callId", callId != null ? callId : "")
                .appendQueryParameter("requestId", callId != null ? callId : "")
                .appendQueryParameter("answer", ACTION_ANSWER_CALL.equals(action) ? "true" : "false")
                .appendQueryParameter("action", ACTION_ANSWER_CALL.equals(action) ? "answer" : "reject")
                .appendQueryParameter("autoAnswer", ACTION_ANSWER_CALL.equals(action) ? "true" : "false")
                .build();

        Intent launch = new Intent(context, MainActivity.class);
        launch.setAction(Intent.ACTION_VIEW);
        launch.setData(uri);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        context.startActivity(launch);
    }

    public static Intent answerIntent(Context context, int notificationId, String callerId, String callId) {
        Intent intent = new Intent(context, CallActionReceiver.class);
        intent.setAction(ACTION_ANSWER_CALL);
        intent.putExtra(EXTRA_NOTIFICATION_ID, notificationId);
        intent.putExtra(EXTRA_CALLER_ID, callerId);
        intent.putExtra(EXTRA_CALL_ID, callId);
        return intent;
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
