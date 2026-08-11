package com.folcen.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class MyFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "FolcenFcmService";
    private static final String TRACE_TAG = "FolcenCallTrace";
    private static final String DEFAULT_CHANNEL_ID = "default_channel";
    public static final String CALL_CHANNEL_ID = "incoming_calls_v5";
    private static final long CALL_ALERT_DEDUPE_MS = 90000L;
    private static final Map<String, Long> ACTIVE_CALL_ALERTS = new ConcurrentHashMap<>();

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        Log.d(TAG, "FCM received data=" + data);
        trace("fcm_received", data, "messageId=" + remoteMessage.getMessageId());
        logDeliveryDelay(data);

        if (isIncomingCall(data)) {
            if (!isAnswerableCall(data)) {
                Log.d(TAG, "Ignoring stale/non-ringing call push");
                trace("fcm_ignored_not_answerable", data, "status=" + firstNonEmpty(data.get("status"), "ringing"));
                return;
            }
            if (MainActivity.isInForeground()) {
                Log.d(TAG, "App is foreground; socket UI will handle incoming call");
                trace("fcm_foreground_socket_handles", data, "");
                return;
            }
            openIncomingCallScreen(data);
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
            trace("fcm_delivery_delay", data, "delayMs=" + delayMs + " serverSentAt=" + sentAt);
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
        String receiverId = firstNonEmpty(data.get("receiverId"), data.get("toUserId"), data.get("to"));
        String callType = firstNonEmpty(data.get("callType"), "video");
        String expiresAt = firstNonEmpty(data.get("expiresAt"), data.get("expiry"));
        String title = callerName.equals("Incoming video call") ? callerName : callerName + " is calling";
        String body = firstNonEmpty(data.get("body"), "Tap to answer");
        int notificationId = stableNotificationId(callId);
        long now = System.currentTimeMillis();
        long timeoutMs = callNotificationTimeoutMs(expiresAt, now);
        Long lastShown = ACTIVE_CALL_ALERTS.get(callId);
        if (lastShown != null && now - lastShown < CALL_ALERT_DEDUPE_MS) {
            Log.d(TAG, "Duplicate incoming call alert ignored callId=" + callId + " ageMs=" + (now - lastShown));
            trace("fcm_duplicate_ignored", data, "ageMs=" + (now - lastShown));
            return;
        }
        cancelIncomingCallNotifications(this, null, 0);
        ACTIVE_CALL_ALERTS.put(callId, now);
        for (Map.Entry<String, Long> entry : ACTIVE_CALL_ALERTS.entrySet()) {
            if (now - entry.getValue() > CALL_ALERT_DEDUPE_MS) {
                ACTIVE_CALL_ALERTS.remove(entry.getKey());
            }
        }
        Log.d(TAG, "Showing incoming call alert callId=" + callId + " callerId=" + callerId + " receiverId=" + receiverId + " callType=" + callType);
        trace("notification_build_start", data, "notificationId=" + notificationId + " timeoutMs=" + timeoutMs);

        PendingIntent fullScreenIntent = PendingIntent.getActivity(
                this,
                notificationId,
                incomingCallIntent(callerId, callId, callerName, receiverId, callType, expiresAt, notificationId),
                pendingIntentFlags()
        );
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CALL_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(false)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setTimeoutAfter(timeoutMs)
                .setSound(Settings.System.DEFAULT_RINGTONE_URI)
                .setVibrate(new long[] { 0, 700, 400, 700, 400, 700 })
                .setFullScreenIntent(fullScreenIntent, true)
                .setContentIntent(fullScreenIntent);

        NotificationManagerCompat.from(this).notify(notificationId, builder.build());
        trace("notification_posted", data, "notificationId=" + notificationId + " fullScreen=true");
    }

    private long callNotificationTimeoutMs(String expiresAtValue, long now) {
        try {
            if (expiresAtValue != null && expiresAtValue.trim().length() > 0) {
                long expiresAt = Long.parseLong(expiresAtValue);
                long remaining = expiresAt - now;
                if (remaining > 0) return Math.min(remaining, CALL_ALERT_DEDUPE_MS);
            }
        } catch (Exception ignored) {}
        return CALL_ALERT_DEDUPE_MS;
    }

    private void openIncomingCallScreen(Map<String, String> data) {
        String callerId = firstNonEmpty(data.get("callerId"), data.get("fromUserId"), data.get("from"));
        String callId = firstNonEmpty(data.get("callId"), "call-" + System.currentTimeMillis());
        String callerName = firstNonEmpty(data.get("callerName"), "Incoming video call");
        String receiverId = firstNonEmpty(data.get("receiverId"), data.get("toUserId"), data.get("to"));
        String callType = firstNonEmpty(data.get("callType"), "video");
        String expiresAt = firstNonEmpty(data.get("expiresAt"), data.get("expiry"));
        int notificationId = stableNotificationId(callId);

        Intent intent = incomingCallIntent(callerId, callId, callerName, receiverId, callType, expiresAt, notificationId);
        try {
            startActivity(intent);
            Log.d(TAG, "Opened full-screen incoming call activity directly for callId=" + callId);
            trace("activity_started_direct", data, "notificationId=" + notificationId);
        } catch (Exception e) {
            Log.w(TAG, "Direct incoming call activity launch failed; falling back to full-screen notification", e);
            trace("activity_started_direct_failed", data, "error=" + e.getClass().getSimpleName() + ":" + e.getMessage());
            showIncomingCall(data);
        }
    }

    private Intent incomingCallIntent(String callerId, String callId, String callerName, String receiverId, String callType, String expiresAt, int notificationId) {
        Intent intent = new Intent(this, IncomingCallActivity.class);
        intent.putExtra("callerId", callerId != null ? callerId : "");
        intent.putExtra("fromUserId", callerId != null ? callerId : "");
        intent.putExtra("callId", callId != null ? callId : "");
        intent.putExtra("callerName", callerName != null ? callerName : "");
        intent.putExtra("receiverId", receiverId != null ? receiverId : "");
        intent.putExtra("toUserId", receiverId != null ? receiverId : "");
        intent.putExtra("callType", callType != null ? callType : "video");
        intent.putExtra("expiresAt", expiresAt != null ? expiresAt : "");
        intent.putExtra("notificationId", notificationId);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return intent;
    }

    private Intent mainCallActionIntent(String callerId, String callId, String receiverId, String callType, String expiresAt, boolean answer) {
        Uri uri = new Uri.Builder()
                .scheme("folcen")
                .authority("incoming-call")
                .appendQueryParameter("callerId", callerId != null ? callerId : "")
                .appendQueryParameter("fromUserId", callerId != null ? callerId : "")
                .appendQueryParameter("callId", callId != null ? callId : "")
                .appendQueryParameter("receiverId", receiverId != null ? receiverId : "")
                .appendQueryParameter("toUserId", receiverId != null ? receiverId : "")
                .appendQueryParameter("callType", callType != null ? callType : "video")
                .appendQueryParameter("expiresAt", expiresAt != null ? expiresAt : "")
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

    public static void cancelIncomingCallNotifications(Context context, String callId, int notificationId) {
        if (context == null) return;
        try {
            if (callId != null && callId.length() > 0) {
                ACTIVE_CALL_ALERTS.remove(callId);
            }
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;
            manager.cancelAll();
            if (notificationId != 0) {
                manager.cancel(notificationId);
            }
            if (callId != null && callId.length() > 0) {
                manager.cancel(stableNotificationId(callId));
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                for (StatusBarNotification notification : manager.getActiveNotifications()) {
                    if (notification == null || notification.getNotification() == null) continue;
                    String channelId = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                            ? notification.getNotification().getChannelId()
                            : "";
                    if (CALL_CHANNEL_ID.equals(channelId)) {
                        manager.cancel(notification.getId());
                    }
                }
            }
            Log.d(TAG, "Cancelled Folcen notifications for incoming call cleanup callId=" + callId + " notificationId=" + notificationId);
        } catch (Exception e) {
            Log.w(TAG, "Unable to cancel incoming call notifications callId=" + callId, e);
        }
    }

    public static int stableNotificationId(String value) {
        if (value == null || value.length() == 0) return 2001;
        return (value.hashCode() & 0x7fffffff) % 2000000000 + 2000;
    }

    private String firstNonEmpty(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && value.trim().length() > 0) return value;
        }
        return "";
    }

    private void trace(String event, Map<String, String> data, String details) {
        String callId = data != null ? firstNonEmpty(data.get("callId"), "") : "";
        String callerId = data != null ? firstNonEmpty(data.get("callerId"), data.get("fromUserId"), data.get("from")) : "";
        String receiverId = data != null ? firstNonEmpty(data.get("receiverId"), data.get("toUserId"), data.get("to")) : "";
        Log.d(TRACE_TAG, "native fcm event=" + event
                + " t=" + System.currentTimeMillis()
                + " callId=" + callId
                + " callerId=" + callerId
                + " receiverId=" + receiverId
                + " " + firstNonEmpty(details, ""));
    }
}
