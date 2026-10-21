package ro.balty1991.bugetfamilie;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Programează reamintirile cu AlarmManager („allow while idle”): sună la ora aleasă și
 * cu telefonul în repaus. WorkManager, folosit până la 1.1.188, întârzia ore întregi
 * pe unele telefoane, iar amintirea de seară de la 20:00 nu mai venea deloc.
 * Lista primită e toată lista: ce nu mai e în ea se anulează. Lista rămâne salvată,
 * ca alarmele să fie puse din nou după repornirea telefonului (ReminderReceiver).
 */
public final class ReminderScheduler {
  private ReminderScheduler() {}

  static final String PREFS = "bf-reminders";
  private static final String KEY_PAYLOAD = "payload";
  private static final String KEY_IDS = "ids";
  private static final int LIMIT = 12;
  /** Orele la care trebuia să sune ceva, ca aplicația să poată spune omului dacă una s-a pierdut. */
  static final String KEY_HISTORY = "history";
  static final String KEY_LAST_FIRED = "lastFired";

  /**
   * BonAI programează doar scadențe (cost-, debt-), copia de siguranță, garanțiile și „Unde e mai ieftin”
   * (aceeași listă ca BONAI_ALERT din local-notifications.ts). Orice altceva vine din bugetul vechi
   * (plicuri, mâncare, ritm, salariu, obiective, seara, bilanțuri) și, dintr-o listă salvată de o versiune
   * veche, nu se mai repune după repornire sau actualizare și nici nu se mai afișează.
   */
  static boolean isRetiredTag(String tag) {
    if (tag == null || tag.isEmpty()) return false;
    return !tag.matches("^(cost|debt|backup|warranty|price)-.*");
  }

  public static void scheduleJson(Context context, String payload) {
    if (payload == null || payload.trim().isEmpty()) return;
    ReminderWorker.ensureChannel(context);
    // Joburile vechi din WorkManager (versiunile de dinainte) nu mai trebuie să sune și ele.
    try { WorkManager.getInstance(context).cancelAllWorkByTag("bf-reminder"); } catch (Exception ignored) { }
    cancelAlarms(context);
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_PAYLOAD, payload).apply();
    arm(context, payload);
  }

  /** După repornire sau actualizare: alarmele se pierd, lista salvată nu. */
  static void rearm(Context context) {
    final String payload = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_PAYLOAD, null);
    if (payload != null) arm(context, payload);
  }

  private static void arm(Context context, String payload) {
    final AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    if (alarms == null) return;
    final JSONArray ids = new JSONArray();
    final SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    JSONArray history;
    try { history = new JSONArray(prefs.getString(KEY_HISTORY, "[]")); } catch (Exception error) { history = new JSONArray(); }
    try {
      final JSONArray items = new JSONArray(payload);
      final int limit = Math.min(items.length(), LIMIT);
      for (int i = 0; i < limit; i += 1) {
        final JSONObject item = items.getJSONObject(i);
        final String title = item.optString("title", "").trim();
        final String body = item.optString("body", "").trim();
        final String tag = item.optString("tag", "bf-reminder-" + i).trim();
        final long atMs = item.optLong("at", 0L);
        final int notifyId = item.optInt("id", 4200 + i);
        if (title.isEmpty() || body.isEmpty() || atMs <= 0L || isRetiredTag(tag)) continue;
        final long now = System.currentTimeMillis();
        if (atMs < now - TimeUnit.MINUTES.toMillis(1)) continue;
        if (atMs - now > TimeUnit.DAYS.toMillis(14)) continue;
        final Intent intent = new Intent(context, ReminderReceiver.class)
          .setAction(ReminderReceiver.ACTION_FIRE)
          .putExtra(ReminderWorker.KEY_TITLE, title)
          .putExtra(ReminderWorker.KEY_BODY, body)
          .putExtra(ReminderWorker.KEY_TAG, tag)
          .putExtra(ReminderWorker.KEY_NOTIFY_ID, notifyId);
        final PendingIntent pending = PendingIntent.getBroadcast(context, notifyId, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        final long at = Math.max(atMs, now + 5_000L);
        // „Allow while idle”: sună și cu telefonul în repaus, de obicei în câteva minute de ora cerută,
        // fără permisiunea de alarme exacte (pe Android 14 ar fi deschis o setare la fiecare programare).
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
        ids.put(notifyId);
        history = rememberPlanned(history, at);
      }
    } catch (Exception ignored) {
      // Payload invalid — nu blocăm aplicația.
    }
    prefs.edit().putString(KEY_IDS, ids.toString()).putString(KEY_HISTORY, history.toString()).apply();
  }

  /** Ține ultimele trei zile de ore programate, fără dubluri (aceeași alarmă se reprogramează des). */
  private static JSONArray rememberPlanned(JSONArray history, long at) {
    final long cutoff = System.currentTimeMillis() - TimeUnit.DAYS.toMillis(3);
    final JSONArray next = new JSONArray();
    boolean known = false;
    for (int i = 0; i < history.length(); i += 1) {
      final long value = history.optLong(i, 0L);
      if (value < cutoff) continue;
      if (value == at) known = true;
      next.put(value);
    }
    if (!known && next.length() < 60) next.put(at);
    return next;
  }

  /** Câte reamintiri trebuiau să sune între ultima sosită și acum (cu 20 de minute de toleranță). */
  static JSONArray missedSince(Context context) {
    final SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    final long lastFired = prefs.getLong(KEY_LAST_FIRED, 0L);
    final long limit = System.currentTimeMillis() - TimeUnit.MINUTES.toMillis(20);
    final JSONArray missed = new JSONArray();
    try {
      final JSONArray history = new JSONArray(prefs.getString(KEY_HISTORY, "[]"));
      for (int i = 0; i < history.length(); i += 1) {
        final long value = history.optLong(i, 0L);
        if (value > 0L && value < limit && value > lastFired + TimeUnit.MINUTES.toMillis(1)) missed.put(value);
      }
    } catch (Exception ignored) { }
    return missed;
  }

  private static void cancelAlarms(Context context) {
    final AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    final SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    if (alarms == null) return;
    try {
      final JSONArray ids = new JSONArray(prefs.getString(KEY_IDS, "[]"));
      for (int i = 0; i < ids.length(); i += 1) {
        final Intent intent = new Intent(context, ReminderReceiver.class).setAction(ReminderReceiver.ACTION_FIRE);
        final PendingIntent pending = PendingIntent.getBroadcast(context, ids.getInt(i), intent, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (pending != null) {
          alarms.cancel(pending);
          pending.cancel();
        }
      }
    } catch (Exception ignored) { }
  }

  public static void cancelAll(Context context) {
    try { WorkManager.getInstance(context).cancelAllWorkByTag("bf-reminder"); } catch (Exception ignored) { }
    cancelAlarms(context);
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_PAYLOAD).remove(KEY_IDS).apply();
  }
}
