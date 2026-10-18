package ro.balty1991.bugetfamilie;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Widgetul BonAI: primele produse din lista de cumpărături, câte mai sunt și scanarea
 * bonului dintr-o atingere. Nu calculează nimic: arată ce publică aplicația. Fără sume.
 */
public class ShoppingWidgetProvider extends AppWidgetProvider {
  private static final String PREFS = "buget_familie_widget";
  private static final String KEY = "shopping_list";

  @Override
  public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
    for (int widgetId : widgetIds) {
      updateOne(context, manager, widgetId);
    }
  }

  static void save(Context context, String json) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY, json == null ? "" : json)
      .apply();
  }

  static void updateAll(Context context) {
    final AppWidgetManager manager = AppWidgetManager.getInstance(context);
    final int[] ids = manager.getAppWidgetIds(new ComponentName(context, ShoppingWidgetProvider.class));
    for (int id : ids) updateOne(context, manager, id);
  }

  private static void updateOne(Context context, AppWidgetManager manager, int widgetId) {
    final RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_shopping);
    views.setOnClickPendingIntent(R.id.widget_shop_root, QuickActions.pendingIntent(context, QuickActions.ACTION_SHOPPING, 31));
    views.setOnClickPendingIntent(R.id.widget_shop_scan, QuickActions.pendingIntent(context, QuickActions.ACTION_RECEIPT, 32));

    final SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    final StringBuilder lines = new StringBuilder();
    String count = "";
    try {
      final JSONObject row = new JSONObject(prefs.getString(KEY, "{}"));
      final JSONArray items = row.optJSONArray("items");
      count = row.optString("count", "");
      if (items != null) {
        for (int i = 0; i < items.length() && i < 4; i++) {
          final String text = items.optString(i, "").trim();
          if (text.isEmpty()) continue;
          if (lines.length() > 0) lines.append('\n');
          lines.append("• ").append(text);
        }
      }
    } catch (Exception ignored) {
      /* widgetul e opțional */
    }
    if (lines.length() == 0) {
      views.setTextViewText(R.id.widget_shop_items, context.getString(R.string.widget_shop_empty));
    } else {
      views.setTextViewText(R.id.widget_shop_items, lines.toString());
    }
    views.setTextViewText(R.id.widget_shop_count, count);
    views.setViewVisibility(R.id.widget_shop_count, count.isEmpty() ? View.GONE : View.VISIBLE);
    manager.updateAppWidget(widgetId, views);
  }
}
