package com.folcen.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class MyFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "FolcenFcmService";
    private static final String DEFAULT_CHANNEL_ID = "default_channel";
    private static final String CALL_CHANNEL_ID = "incoming_calls_v4";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        Log.d(TAG, "FCM received data=" + data);
        logDeliveryDelay(data);

        if (isIncomingCall(data)) {
            if (!isAnswerableCall(data)) {
                Log.d(TAG, "Ignoring stale/non-ringing call push");
                return;
            }
            if (MainActivity.isInForeground()) {
                Log.d(TAG, "App is foreground; socket UI will handle incoming call");
                return;
            }
            showIncomingCall(data);
            return;
        }

        String title = data.get("title");
        String body = data.get("body");
        if (remoteMessage.getNotification() != null) {
            if (title == null) title = remoteMessage.getNotification().getTitle();
            if (body == null) body = remoteMessage.getNotification().getBody();
        }

        sendNotification(
                title != null ? title : "Folcen",
                body != null ? body : "You have a new notification",
                data
        );
    }

    @Override
    public void onNewToken(String token) {
        Log.d(TAG, "Refreshed token: " + token);
    }

    private boolean isIncomingCall(Map<String, String> data) {
        if (data == null) return false;
        return "incoming_call".equals(data.get("type"))
                || "call:invite".equals(data.get("event"))
                || "call".equals(data.get("category"));
    }

    private void logDeliveryDelay(Map<String, String> data) {
        if (data == null) return;
        try {
            String sentAt = data.get("serverSentAt");
            if (sentAt == null || sentAt.length() == 0) return;
            long delayMs = System.currentTimeMillis() - Long.parseLong(sentAt);
            Log.d(TAG, "FCM delivery delayMs=" + delayMs + " type=" + firstNonEmpty(data.get("type"), data.get("event"), data.get("category")));
        } catch (Exception ignored) {}
    }

    private boolean isAnswerableCall(Map<String, String> data) {
        if (data == null) return false;
        String status = firstNonEmpty(data.get("status"), "ringing");
        if (!"ringing".equals(status)) return false;
        String expiresAtValue = firstNonEmpty(data.get("expiresAt"), data.get("expiry"));
        if (expiresAtValue.length() == 0) return true;
        try {
            long expiresAt = Long.parseLong(expiresAtValue);
            return expiresAt == 0 || System.currentTimeMillis() <= expiresAt;
        } catch (Exception ignored) {
            return true;
        }
    }

    private void showIncomingCall(Map<String, String> data) {
        createCallChannel();

        String callerId = firstNonEmpty(data.get("callerId"), data.get("fromUserId"), data.get("from"));
        String callId = firstNonEmpty(data.get("callId"), "call-" + System.currentTimeMillis());
        String callerName = firstNonEmpty(data.get("callerName"), "Incoming video call");
        String title = callerName.equals("Incoming video call") ? callerName : callerName + " is calling";
        String body = firstNonEmpty(data.get("body"), "Tap to answer");
        int notificationId = stableNotificationId(callId);

        PendingIntent fullScreenIntent = PendingIntent.getActivity(
                this,
                notificationId,
                incomingCallIntent(callerId, callId, callerName, notificationId),
                pendingIntentFlags()
        );

        PendingIntent answerIntent = PendingIntent.getActivity(
                this,
                notificationId + 2,
                callIntent(callerId, callId, true),
                pendingIntentFlags()
        );

        PendingIntent rejectIntent = PendingIntent.getBroadcast(
                this,
                notificationId + 1,
                CallActionReceiver.rejectIntent(this, notificationId, callerId, callId),
                pendingIntentFlags()
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CALL_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setSound(Settings.System.DEFAULT_RINGTONE_URI)
                .setVibrate(new long[] { 0, 700, 400, 700, 400, 700 })
                .setFullScreenIntent(fullScreenIntent, true)
                .setContentIntent(fullScreenIntent)
                .addAction(R.mipmap.ic_launcher, "Reject", rejectIntent)
                .addAction(R.mipmap.ic_launcher, "Answer", answerIntent);

        NotificationManagerCompat.from(this).notify(notificationId, builder.build());
    }

    private Intent incomingCallIntent(String callerId, String callId, String callerName, int notificationId) {
        Intent intent = new Intent(this, IncomingCallActivity.class);
        intent.putExtra("callerId", callerId != null ? callerId : "");
        intent.putExtra("fromUserId", callerId != null ? callerId : "");
        intent.putExtra("callId", callId != null ? callId : "");
        intent.putExtra("callerName", callerName != null ? callerName : "");
        intent.putExtra("notificationId", notificationId);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return intent;
    }

    private Intent callIntent(String callerId, String callId, boolean answer) {
        Uri uri = new Uri.Builder()
                .scheme("folcen")
                .authority("incoming-call")
                .appendQueryParameter("callerId", callerId != null ? callerId : "")
                .appendQueryParameter("fromUserId", callerId != null ? callerId : "")
                .appendQueryParameter("callId", callId != null ? callId : "")
                .appendQueryParameter("answer", answer ? "true" : "false")
                .appendQueryParameter("action", answer ? "answer" : "reject")
                .appendQueryParameter("autoAnswer", answer ? "true" : "false")
                .build();

        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(uri);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return intent;
    }

    private void sendNotification(String title, String messageBody, Map<String, String> data) {
        createDefaultChannel();

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, intent, pendingIntentFlags());

        NotificationCompat.Builder notificationBuilder =
                new NotificationCompat.Builder(this, DEFAULT_CHANNEL_ID)
                        .setSmallIcon(R.mipmap.ic_launcher)
                        .setContentTitle(title)
                        .setContentText(messageBody)
                        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                        .setAutoCancel(true)
                        .setContentIntent(pendingIntent);

        NotificationManagerCompat.from(this).notify(stableNotificationId(String.valueOf(System.currentTimeMillis())), notificationBuilder.build());
    }

    private void createDefaultChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                DEFAULT_CHANNEL_ID,
                "Default Channel",
                NotificationManager.IMPORTANCE_DEFAULT
        );
        NotificationManager notificationManager = getSystemService(NotificationManager.class);
        if (notificationManager != null) notificationManager.createNotificationChannel(channel);
    }

    private void createCallChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                CALL_CHANNEL_ID,
                "Incoming calls",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Incoming video call alerts");
        channel.enableLights(true);
        channel.setLightColor(Color.GREEN);
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0, 700, 400, 700, 400, 700 });
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        channel.setSound(Settings.System.DEFAULT_RINGTONE_URI, attrs);
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        NotificationManager notificationManager = getSystemService(NotificationManager.class);
        if (notificationManager != null) notificationManager.createNotificationChannel(channel);
    }

    private int pendingIntentFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return flags;
    }

    private int stableNotificationId(String value) {
        if (value == null || value.length() == 0) return 2001;
        return Math.abs(value.hashCode());
    }

    private String firstNonEmpty(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && value.trim().length() > 0) return value;
        }
        return "";
    }
}
