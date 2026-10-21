package ro.balty1991.bugetfamilie;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONObject;

/**
 * Widgetul „BonAI · luna asta”: cât ai dat pe cumpărături luna asta, din câte bonuri, următoarea
 * plată și „Scanează” dintr-o atingere. Îl adaugă doar cine vrea o sumă pe ecranul principal.
 *
 * Nu calculează nimic: arată ce publică aplicația. Dacă aplicația n-a mai fost deschisă azi,
 * rândul plății spune că datele sunt mai vechi, în loc să numere greșit zilele până la ea.
 */
public class MonthWidgetProvider extends AppWidgetProvider {
  private static final String PREFS = "buget_familie_widget";
  private static final String KEY = "month";
  /** Cheile widgeturilor bugetului vechi („Poți cheltui azi”, „Plicurile mele”, „Săptămâna banilor”). */
  private static final String[] RETIRED = { "spend_today", "envelopes", "week" };

  @Override
  public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
    for (int widgetId : widgetIds) updateOne(context, manager, widgetId);
  }

  static void save(Context context, String json) {
    final SharedPreferences.Editor edit = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
    for (String key : RETIRED) edit.remove(key);
    edit.putString(KEY, json == null ? "" : json).apply();
  }

  static void updateAll(Context context) {
    final AppWidgetManager manager = AppWidgetManager.getInstance(context);
    final int[] ids = manager.getAppWidgetIds(new ComponentName(context, MonthWidgetProvider.class));
    for (int id : ids) updateOne(context, manager, id);
  }

  private static void updateOne(Context context, AppWidgetManager manager, int widgetId) {
    final RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_month);
    views.setOnClickPendingIntent(R.id.widget_month_root, QuickActions.pendingIntent(context, QuickActions.ACTION_TODAY, 41));
    views.setOnClickPendingIntent(R.id.widget_month_scan, QuickActions.pendingIntent(context, QuickActions.ACTION_RECEIPT, 42));

    String title = "";
    String amount = "";
    String caption = "";
    String next = "";
    String date = "";
    String stale = "";
    String zone = "";
    try {
      final JSONObject row = new JSONObject(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "{}"));
      title = row.optString("title", "");
      amount = row.optString("amount", "");
      caption = row.optString("caption", "");
      next = row.optString("next", "");
      date = row.optString("date", "");
      stale = row.optString("stale", "");
      zone = row.optString("zone", "");
    } catch (Exception ignored) {
      /* fără date: mesajul de mai jos */
    }
    final SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
    if (!zone.isEmpty()) format.setTimeZone(TimeZone.getTimeZone(zone));
    final boolean fresh = format.format(new Date()).equals(date);
    views.setTextViewText(R.id.widget_month_title, title.isEmpty() ? context.getString(R.string.widget_month_title) : title);
    if (amount.isEmpty()) {
      views.setTextViewText(R.id.widget_month_amount, "—");
      views.setTextViewText(R.id.widget_month_caption, context.getString(R.string.widget_month_empty));
      views.setTextViewText(R.id.widget_month_next, "");
    } else {
      views.setTextViewText(R.id.widget_month_amount, amount);
      views.setTextViewText(R.id.widget_month_caption, caption);
      // „în 3 zile” e adevărat doar în ziua publicării; altă zi înseamnă „deschide aplicația”.
      views.setTextViewText(R.id.widget_month_next, fresh || stale.isEmpty() ? next : stale);
    }
    manager.updateAppWidget(widgetId, views);
  }
}
