package com.folcen.app;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class IncomingCallActivity extends Activity {
    private String callerId;
    private String callId;
    private int notificationId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showOverLockScreen();

        Intent intent = getIntent();
        callerId = firstNonEmpty(intent.getStringExtra("callerId"), intent.getStringExtra("fromUserId"));
        callId = firstNonEmpty(intent.getStringExtra("callId"), intent.getStringExtra("requestId"), "call-" + System.currentTimeMillis());
        notificationId = intent.getIntExtra("notificationId", 0);
        String callerName = firstNonEmpty(intent.getStringExtra("callerName"), "Incoming video call");

        setContentView(buildView(callerName));
    }

    private View buildView(String callerName) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(48, 64, 48, 64);
        root.setBackgroundColor(Color.rgb(9, 14, 22));

        TextView title = new TextView(this);
        title.setText(callerName.equals("Incoming video call") ? callerName : callerName + " is calling");
        title.setTextColor(Color.WHITE);
        title.setTextSize(28);
        title.setGravity(Gravity.CENTER);
        root.addView(title, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        TextView subtitle = new TextView(this);
        subtitle.setText("Video call");
        subtitle.setTextColor(Color.rgb(180, 190, 205));
        subtitle.setTextSize(18);
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        subtitleParams.setMargins(0, 18, 0, 72);
        root.addView(subtitle, subtitleParams);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER);

        Button reject = new Button(this);
        reject.setText("Reject");
        reject.setTextColor(Color.WHITE);
        reject.setBackgroundColor(Color.rgb(210, 54, 70));
        reject.setOnClickListener(v -> rejectCall());

        Button answer = new Button(this);
        answer.setText("Answer");
        answer.setTextColor(Color.WHITE);
        answer.setBackgroundColor(Color.rgb(38, 166, 91));
        answer.setOnClickListener(v -> answerCall());

        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(0, 120, 1);
        buttonParams.setMargins(18, 0, 18, 0);
        actions.addView(reject, buttonParams);
        actions.addView(answer, buttonParams);
        root.addView(actions, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        return root;
    }

    private void answerCall() {
        cancelNotification();
        Uri uri = new Uri.Builder()
                .scheme("folcen")
                .authority("incoming-call")
                .appendQueryParameter("callerId", callerId != null ? callerId : "")
                .appendQueryParameter("fromUserId", callerId != null ? callerId : "")
                .appendQueryParameter("callId", callId != null ? callId : "")
                .appendQueryParameter("requestId", callId != null ? callId : "")
                .appendQueryParameter("answer", "true")
                .appendQueryParameter("action", "answer")
                .appendQueryParameter("autoAnswer", "true")
                .build();

        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(uri);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
        finish();
    }

    private void rejectCall() {
        cancelNotification();
        Uri uri = new Uri.Builder()
                .scheme("folcen")
                .authority("incoming-call")
                .appendQueryParameter("callerId", callerId != null ? callerId : "")
                .appendQueryParameter("fromUserId", callerId != null ? callerId : "")
                .appendQueryParameter("callId", callId != null ? callId : "")
                .appendQueryParameter("requestId", callId != null ? callId : "")
                .appendQueryParameter("answer", "false")
                .appendQueryParameter("action", "reject")
                .build();

        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(uri);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
        finish();
    }

    private void cancelNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null && notificationId != 0) {
            manager.cancel(notificationId);
        }
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
}
