package com.folcen.app;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.lang.ref.WeakReference;

public class IncomingCallActivity extends Activity {
    private static final String TAG = "FolcenIncomingCall";

    private static WeakReference<IncomingCallActivity>
            activeInstance =
            new WeakReference<>(null);
    private String callerId;
    private String callId;
    private int notificationId;
    private String receiverId;
    private String callType;
    private String expiresAt;
    private boolean actionTaken = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        activeInstance =
                new WeakReference<>(this);

        showOverLockScreen();

        Intent intent = getIntent();
        callerId = firstNonEmpty(intent.getStringExtra("callerId"), intent.getStringExtra("fromUserId"));
        callId = firstNonEmpty(intent.getStringExtra("callId"), "call-" + System.currentTimeMillis());
        notificationId = intent.getIntExtra("notificationId", 0);
        receiverId = firstNonEmpty(intent.getStringExtra("receiverId"), intent.getStringExtra("toUserId"));
        callType = firstNonEmpty(intent.getStringExtra("callType"), "video");
        expiresAt = firstNonEmpty(intent.getStringExtra("expiresAt"), "");
        String callerName = firstNonEmpty(intent.getStringExtra("callerName"), "Incoming video call");
        if (isExpired()) {
            Log.d(TAG, "expired incoming screen dismissed callId=" + callId + " expiresAt=" + expiresAt);
            cancelNotification();
            finish();
            return;
        }
        Log.d(TAG, "display callId=" + callId + " callerId=" + callerId + " receiverId=" + receiverId + " callType=" + callType);

        // Keep the full-screen call notification alive while the call is ringing.
        // On Xiaomi/HyperOS cancelling it here can immediately dismiss the
        // IncomingCallActivity that was launched by the full-screen intent.
        setContentView(buildView(callerName));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        callerId = firstNonEmpty(intent.getStringExtra("callerId"), intent.getStringExtra("fromUserId"));
        callId = firstNonEmpty(intent.getStringExtra("callId"), callId);
        notificationId = intent.getIntExtra("notificationId", notificationId);
        receiverId = firstNonEmpty(intent.getStringExtra("receiverId"), intent.getStringExtra("toUserId"), receiverId);
        callType = firstNonEmpty(intent.getStringExtra("callType"), callType, "video");
        expiresAt = firstNonEmpty(intent.getStringExtra("expiresAt"), expiresAt);
        String callerName = firstNonEmpty(intent.getStringExtra("callerName"), "Incoming video call");
        if (isExpired()) {
            Log.d(TAG, "expired incoming refresh dismissed callId=" + callId + " expiresAt=" + expiresAt);
            cancelNotification();
            finish();
            return;
        }
        actionTaken = false;
        Log.d(TAG, "refresh callId=" + callId + " callerId=" + callerId + " receiverId=" + receiverId + " callType=" + callType);

        // Do not cancel the backing full-screen notification while ringing.
        setContentView(buildView(callerName));
    }

    @Override
    protected void onDestroy() {
        IncomingCallActivity active =
                activeInstance.get();

        if (active == this) {
            activeInstance.clear();
        }

        super.onDestroy();
    }

    public static void dismissActiveCall(
            String terminalCallId
    ) {
        IncomingCallActivity activity =
                activeInstance.get();

        if (activity == null) {
            return;
        }

        /*
         * Never let a terminal event for an older/newer call
         * close a different incoming call screen.
         */
        if (
                terminalCallId != null &&
                terminalCallId.length() > 0 &&
                activity.callId != null &&
                activity.callId.length() > 0 &&
                !terminalCallId.equals(
                        activity.callId
                )
        ) {
            Log.d(
                    TAG,
                    "Ignoring terminal event for different callId="
                            + terminalCallId
                            + " active="
                            + activity.callId
            );
            return;
        }

        activity.runOnUiThread(() -> {
            if (
                    activity.isFinishing() ||
                    activity.isDestroyed()
            ) {
                return;
            }

            Log.d(
                    TAG,
                    "Closing incoming screen from terminal FCM callId="
                            + terminalCallId
            );

            activity.actionTaken = true;
            activity.cancelNotification();
            activity.finish();
        });
    }

    private View buildView(String callerName) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(28), dp(58), dp(28), dp(42));
        GradientDrawable bg = new GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                new int[] { Color.rgb(6, 13, 24), Color.rgb(12, 24, 42), Color.rgb(3, 7, 18) }
        );
        root.setBackground(bg);

        TextView pill = new TextView(this);
        pill.setText("Folcen video call");
        pill.setTextColor(Color.rgb(172, 230, 222));
        pill.setTextSize(13);
        pill.setTypeface(Typeface.DEFAULT_BOLD);
        pill.setGravity(Gravity.CENTER);
        pill.setLetterSpacing(0.04f);
        GradientDrawable pillBg = rounded(Color.argb(38, 52, 235, 215), dp(999));
        pillBg.setStroke(dp(1), Color.argb(80, 52, 235, 215));
        pill.setBackground(pillBg);
        LinearLayout.LayoutParams pillParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                dp(34)
        );
        pill.setPadding(dp(16), 0, dp(16), 0);
        root.addView(pill, pillParams);

        TextView avatar = new TextView(this);
        avatar.setText(initials(callerName));
        avatar.setTextColor(Color.WHITE);
        avatar.setTextSize(34);
        avatar.setTypeface(Typeface.DEFAULT_BOLD);
        avatar.setGravity(Gravity.CENTER);
        GradientDrawable avatarBg = rounded(Color.rgb(52, 86, 166), dp(999));
        avatarBg.setStroke(dp(3), Color.argb(210, 255, 255, 255));
        avatar.setBackground(avatarBg);
        LinearLayout.LayoutParams avatarParams = new LinearLayout.LayoutParams(dp(112), dp(112));
        avatarParams.setMargins(0, dp(72), 0, dp(24));
        root.addView(avatar, avatarParams);

        TextView title = new TextView(this);
        title.setText(callerName.equals("Incoming video call") ? "Incoming call" : callerName);
        title.setTextColor(Color.WHITE);
        title.setTextSize(28);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        title.setMaxLines(2);
        root.addView(title, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        TextView subtitle = new TextView(this);
        subtitle.setText("Incoming video call");
        subtitle.setTextColor(Color.rgb(191, 204, 220));
        subtitle.setTextSize(16);
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        subtitleParams.setMargins(0, dp(10), 0, 0);
        root.addView(subtitle, subtitleParams);

        TextView hint = new TextView(this);
        hint.setText("Answer once to join. Reject sends a missed-call update.");
        hint.setTextColor(Color.rgb(128, 144, 166));
        hint.setTextSize(13);
        hint.setGravity(Gravity.CENTER);
        hint.setMaxLines(2);
        LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        hintParams.setMargins(0, dp(14), 0, 0);
        root.addView(hint, hintParams);

        View spacer = new View(this);
        root.addView(spacer, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1
        ));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER);
        actions.setPadding(0, 0, 0, dp(8));

        Button reject = new Button(this);
        reject.setText("Reject");
        reject.setTextColor(Color.WHITE);
        reject.setTextSize(16);
        reject.setTypeface(Typeface.DEFAULT_BOLD);
        reject.setAllCaps(false);
        reject.setBackground(rounded(Color.rgb(214, 58, 72), dp(22)));
        reject.setOnClickListener(v -> rejectCall());

        Button answer = new Button(this);
        answer.setText("Answer");
        answer.setTextColor(Color.WHITE);
        answer.setTextSize(16);
        answer.setTypeface(Typeface.DEFAULT_BOLD);
        answer.setAllCaps(false);
        answer.setBackground(rounded(Color.rgb(23, 177, 116), dp(22)));
        answer.setOnClickListener(v -> answerCall());

        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(0, dp(64), 1);
        buttonParams.setMargins(dp(8), 0, dp(8), 0);
        actions.addView(reject, buttonParams);
        actions.addView(answer, buttonParams);
        root.addView(actions, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        return root;
    }

    private GradientDrawable rounded(int color, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(radius);
        return drawable;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private String initials(String name) {
        String clean = firstNonEmpty(name, "F").trim();
        if (clean.equals("Incoming video call")) return "F";
        String[] parts = clean.split("\\s+");
        String first = parts.length > 0 && parts[0].length() > 0 ? parts[0].substring(0, 1) : "F";
        String second = parts.length > 1 && parts[1].length() > 0 ? parts[1].substring(0, 1) : "";
        return (first + second).toUpperCase();
    }

    private void answerCall() {
        if (actionTaken) return;
        if (isExpired()) {
            Log.d(TAG, "expired answer ignored callId=" + callId + " expiresAt=" + expiresAt);
            cancelNotification();
            finish();
            return;
        }
        actionTaken = true;
        Log.d(TAG, "answer tapped callId=" + callId + " callerId=" + callerId + " receiverId=" + receiverId);
        cancelNotification();
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
                .appendQueryParameter("answer", "true")
                .appendQueryParameter("action", "answer")
                .appendQueryParameter("autoAnswer", "true")
                .build();

        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(uri);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
        Log.d(TAG, "answer launched MainActivity callId=" + callId);
        finish();
    }

    private void rejectCall() {
        if (actionTaken) return;
        if (isExpired()) {
            Log.d(TAG, "expired reject ignored callId=" + callId + " expiresAt=" + expiresAt);
            cancelNotification();
            finish();
            return;
        }
        actionTaken = true;
        Log.d(TAG, "reject tapped callId=" + callId + " callerId=" + callerId + " receiverId=" + receiverId);
        cancelNotification();
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
                .appendQueryParameter("answer", "false")
                .appendQueryParameter("action", "reject")
                .build();

        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(uri);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
        Log.d(TAG, "reject launched MainActivity callId=" + callId);
        finish();
    }

    private void cancelNotification() {
        MyFirebaseMessagingService.cancelIncomingCallNotifications(this, callId, notificationId);
    }

    private void showOverLockScreen() {
        Window window = getWindow();
        window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                        | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                        | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                        | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
    }

    private String firstNonEmpty(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && value.trim().length() > 0) return value;
        }
        return "";
    }

    private boolean isExpired() {
        if (expiresAt == null || expiresAt.trim().length() == 0) return false;
        try {
            long expiry = Long.parseLong(expiresAt);
            return expiry > 0 && System.currentTimeMillis() > expiry;
        } catch (Exception ignored) {
            return false;
        }
    }
}
