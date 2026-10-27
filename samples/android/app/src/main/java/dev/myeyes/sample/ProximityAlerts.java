package dev.myeyes.sample;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

/**
 * Near-object "break through whatever the user is doing" alert path.
 *
 * Android allows this more directly than iOS: a high-importance channel plus a full-screen
 * intent can launch {@link AlertActivity} over the foreground app. Two things are outside
 * our control and are handled as graceful degradation, never as a guarantee:
 *   1. setBypassDnd(true) only takes effect if the user grants this app a Do Not Disturb
 *      override in system settings. Without it the channel still works, it just respects DND.
 *   2. On Android 14+ (API 34+) USE_FULL_SCREEN_INTENT is a restricted permission. We ask
 *      NotificationManager.canUseFullScreenIntent() and fall back to a heads-up notification
 *      when it is denied.
 */
final class ProximityAlerts {
    /** Kept word-for-word in step with the iOS app so both products tell the same story. */
    static final String ALERT_TITLE = "Watch out";
    static final String ALERT_DETAIL_FALLBACK = "Object close in the camera zone. Check your surroundings.";
    static final String DISMISS_LABEL = "Dismiss";

    static final String CHANNEL_PROXIMITY = "myeyes-proximity";
    static final String CHANNEL_PROXIMITY_NAME = "Proximity alerts";
    static final int NOTIFICATION_PROXIMITY = 18;
    static final String EXTRA_LABEL = "dev.myeyes.sample.extra.LABEL";
    static final String EXTRA_DETAIL = "dev.myeyes.sample.extra.DETAIL";
    /** Auto-dismiss window for the full-screen alert. */
    static final long AUTO_DISMISS_MS = 6000;

    private ProximityAlerts() {}

    /** Alarm-usage attributes: the alarm stream stays audible when the ringer is silenced. */
    static AudioAttributes alarmAttributes() {
        return new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
    }

    /** Idempotent: creating an existing channel only updates name/description, not user choices. */
    static void createChannel(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_PROXIMITY, CHANNEL_PROXIMITY_NAME, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Full-screen warning when a detected object is close.");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] {0, 160, 70, 160});
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        Uri alarm = android.provider.Settings.System.DEFAULT_ALARM_ALERT_URI;
        if (alarm != null) channel.setSound(alarm, alarmAttributes());
        // Honoured only when the user has granted a DND override; otherwise silently ignored.
        try { channel.setBypassDnd(true); }
        catch (SecurityException | RuntimeException ignored) { /* No DND override granted. */ }
        manager.createNotificationChannel(channel);
    }

    /**
     * True when this build may launch a full-screen intent. Pre-34 the manifest permission is
     * enough; on 34+ the user (or an install-time grant for accessibility/alarm apps) decides.
     */
    static boolean canUseFullScreenIntent(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return false;
        if (Build.VERSION.SDK_INT >= 34) return manager.canUseFullScreenIntent();
        return true;
    }

    static Intent alertIntent(Context context, String label, String detail) {
        return new Intent(context, AlertActivity.class)
                .setAction(Intent.ACTION_MAIN)
                .putExtra(EXTRA_LABEL, label == null ? "" : label)
                .putExtra(EXTRA_DETAIL, detail == null || detail.isEmpty() ? ALERT_DETAIL_FALLBACK : detail)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_CLEAR_TASK
                        | Intent.FLAG_ACTIVITY_NO_USER_ACTION
                        | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
    }

    /**
     * Posts the near-object alert. Returns true when it was posted with a full-screen intent,
     * false when it degraded to a heads-up notification only.
     */
    static boolean raise(Context context, String label, String detail) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return false;
        createChannel(context);

        String body = detail == null || detail.isEmpty() ? ALERT_DETAIL_FALLBACK : detail;
        String title = label == null || label.isEmpty() ? ALERT_TITLE : ALERT_TITLE + " · " + label;
        PendingIntent full = PendingIntent.getActivity(context, 2,
                alertIntent(context, label, body),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = new Notification.Builder(context, CHANNEL_PROXIMITY)
                .setSmallIcon(R.drawable.ic_scan)
                .setContentTitle(title)
                .setContentText(body)
                .setCategory(Notification.CATEGORY_ALARM)
                .setPriority(Notification.PRIORITY_HIGH)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setOnlyAlertOnce(false)
                .setTimeoutAfter(AUTO_DISMISS_MS)
                .setContentIntent(full);

        boolean fullScreen = canUseFullScreenIntent(context);
        if (fullScreen) {
            // true = show the activity even when the screen is on and unlocked.
            builder.setFullScreenIntent(full, true);
        }
        try { manager.notify(NOTIFICATION_PROXIMITY, builder.build()); }
        catch (SecurityException | RuntimeException ignored) { return false; /* Notifications denied. */ }
        return fullScreen;
    }

    static void clear(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(NOTIFICATION_PROXIMITY);
    }
}
