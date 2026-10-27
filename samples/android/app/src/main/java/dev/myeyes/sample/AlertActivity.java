package dev.myeyes.sample;

import android.app.Activity;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Full-screen "Watch out" warning, launched by the full-screen intent in {@link ProximityAlerts}.
 * Shows over the foreground app and over the lock screen, vibrates sharply, and plays a tone on
 * the alarm stream so it is audible when the ringer is silenced. Auto-dismisses.
 */
public final class AlertActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable autoDismiss = this::finishAndRemoveTask;
    private MediaPlayer player;
    private Vibrator vibrator;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        showOverEverything();
        setContentView(buildLayout());
        startFeedback();
        main.postDelayed(autoDismiss, ProximityAlerts.AUTO_DISMISS_MS);
    }

    private void showOverEverything() {
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        setTitle(ProximityAlerts.ALERT_TITLE);
    }

    private View buildLayout() {
        String label = getIntent() == null ? "" : getIntent().getStringExtra(ProximityAlerts.EXTRA_LABEL);
        String detail = getIntent() == null ? null : getIntent().getStringExtra(ProximityAlerts.EXTRA_DETAIL);
        if (detail == null || detail.isEmpty()) detail = ProximityAlerts.ALERT_DETAIL_FALLBACK;

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(0xFF7A1020);
        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText(ProximityAlerts.ALERT_TITLE);
        title.setTextSize(56);
        title.setTextColor(0xFFFFFFFF);
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        if (label != null && !label.isEmpty()) {
            TextView detected = new TextView(this);
            detected.setText(label);
            detected.setTextSize(32);
            detected.setTextColor(0xFFFFD9DF);
            detected.setGravity(Gravity.CENTER);
            detected.setPadding(0, pad / 2, 0, 0);
            root.addView(detected);
        }

        TextView body = new TextView(this);
        body.setText(detail);
        body.setTextSize(18);
        body.setTextColor(0xFFFFE8EC);
        body.setGravity(Gravity.CENTER);
        body.setPadding(0, pad, 0, pad);
        root.addView(body);

        Button dismiss = new Button(this);
        dismiss.setText(ProximityAlerts.DISMISS_LABEL);
        dismiss.setTextSize(20);
        dismiss.setOnClickListener(view -> finishAndRemoveTask());
        root.addView(dismiss);
        return root;
    }

    private void startFeedback() {
        ProximityAlerts.clear(this);
        vibrate();
        playAlarmTone();
    }

    private void vibrate() {
        vibrator = Build.VERSION.SDK_INT >= 31 && getSystemService(VibratorManager.class) != null
                ? getSystemService(VibratorManager.class).getDefaultVibrator()
                : (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        // Short, sharp double pulse. Same cadence as the in-app alert so it is recognisable.
        VibrationEffect effect = VibrationEffect.createWaveform(new long[] {0, 160, 70, 160}, -1);
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                vibrator.vibrate(effect, new VibrationAttributes.Builder()
                        .setUsage(VibrationAttributes.USAGE_ALARM).build());
            } else {
                vibrator.vibrate(effect);
            }
        } catch (RuntimeException ignored) { /* Vibrator unavailable; the visual alert remains. */ }
    }

    /** Alarm usage: audible even when the ringer is silenced, subject to alarm volume. */
    private void playAlarmTone() {
        Uri tone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (tone == null) tone = android.provider.Settings.System.DEFAULT_ALARM_ALERT_URI;
        if (tone == null) return;
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            player.setDataSource(this, tone);
            player.setLooping(false);
            player.setVolume(1f, 1f);
            player.setOnPreparedListener(MediaPlayer::start);
            player.prepareAsync();
        } catch (Exception ignored) {
            releasePlayer();
        }
    }

    @Override protected void onPause() {
        super.onPause();
        // Never keep making noise once we are no longer the visible warning.
        stopFeedback();
    }

    @Override protected void onDestroy() {
        super.onDestroy();
        main.removeCallbacks(autoDismiss);
        stopFeedback();
    }

    private void stopFeedback() {
        if (vibrator != null) { try { vibrator.cancel(); } catch (RuntimeException ignored) { } }
        releasePlayer();
    }

    private void releasePlayer() {
        if (player == null) return;
        try { player.release(); } catch (RuntimeException ignored) { }
        player = null;
    }

    /** Alarm stream level, exposed for diagnostics and tests of the audio routing choice. */
    int alarmVolume() {
        AudioManager audio = getSystemService(AudioManager.class);
        return audio == null ? 0 : audio.getStreamVolume(AudioManager.STREAM_ALARM);
    }
}
