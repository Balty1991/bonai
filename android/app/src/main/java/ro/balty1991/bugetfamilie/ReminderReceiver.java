package ro.balty1991.bugetfamilie;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Alarma unei reamintiri, plus repunerea alarmelor după repornire sau actualizarea aplicației. */
public class ReminderReceiver extends BroadcastReceiver {
  static final String ACTION_FIRE = "ro.balty1991.bugetfamilie.REMINDER";

  @Override
  public void onReceive(Context context, Intent intent) {
    final String action = intent == null ? null : intent.getAction();
    if (ACTION_FIRE.equals(action)) {
      final String title = intent.getStringExtra(ReminderWorker.KEY_TITLE);
      final String body = intent.getStringExtra(ReminderWorker.KEY_BODY);
      final String tag = intent.getStringExtra(ReminderWorker.KEY_TAG);
      final int notifyId = intent.getIntExtra(ReminderWorker.KEY_NOTIFY_ID, 4200);
      if (title == null || title.isEmpty() || body == null || body.isEmpty() || ReminderScheduler.isRetiredTag(tag)) return;
      context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE).edit().putLong(ReminderScheduler.KEY_LAST_FIRED, System.currentTimeMillis()).apply();
      ReminderWorker.notifyNow(context, title, body, notifyId, tag);
      return;
    }
    if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
      ReminderScheduler.rearm(context);
    }
  }
}
