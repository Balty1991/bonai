package ro.balty1991.bugetfamilie;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ComponentCallbacks2;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognizerIntent;
import androidx.core.splashscreen.SplashScreen;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.util.ArrayList;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
  private static final int REQ_POST_NOTIFICATIONS = 4101;
  private static final int REQ_VOICE = 4102;
  /** Un singur fir, în ordine: ultima cifră publicată rămâne pe widget. */
  private static final java.util.concurrent.ExecutorService WIDGET_WORK = java.util.concurrent.Executors.newSingleThreadExecutor();
  private static final String PREFS_CHROME = "bf_chrome";
  private static final String PREF_DARK = "dark";
  private volatile boolean keepSplash = true;
  private boolean launchDark;
  private View splashCover;

  /**
   * Acțiunea cerută din widget sau din dală, până când stratul web o cere.
   * La pornire rece pagina încă nu există, deci JS o ridică singur (consume).
   * Dacă aplicația e deja vizibilă, onNewIntent semnalează JS să consume imediat.
   */
  private String pendingQuickAction;
  private boolean nativeBridgesAttached;
  /** WebView-ul e pauzat în fundal; evenimentul JS se pierde dacă îl trimitem din onNewIntent. */
  private boolean activityResumed;
  private boolean quickActionNotifyPending;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    launchDark = getSharedPreferences(PREFS_CHROME, MODE_PRIVATE).getBoolean(PREF_DARK, false);
    if (launchDark) {
      setTheme(R.style.AppTheme_NoActionBarLaunchDark);
    }
    SplashScreen splash = SplashScreen.installSplashScreen(this);
    splash.setKeepOnScreenCondition(() -> keepSplash);
    /* Fără zoom/fade. Plicul nativ stă până JS spune că First Run / Astăzi
       e pictat — nu când WebView-ul e gol sau când e doar overlay-ul HTML. */
    splash.setOnExitAnimationListener(splashView -> splashView.remove());
    registerPlugin(BugetFamilieNativePlugin.class);
    super.onCreate(savedInstanceState);
    getWindow().setBackgroundDrawableResource(
      launchDark ? R.drawable.launch_screen_dark : R.drawable.launch_screen
    );
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    if (Build.VERSION.SDK_INT >= 29) {
      getWindow().setNavigationBarContrastEnforced(false);
    }
    /* În lista de aplicații recente, captura aplicației arăta sumele și numele. Pe Android 13+
       sistemul pune în loc o imagine goală; capturile de ecran făcute de om rămân permise. */
    if (Build.VERSION.SDK_INT >= 33) {
      setRecentsScreenshotEnabled(false);
    }
    applyChrome(Color.parseColor(launchDark ? "#12161C" : "#EEF1EF"), !launchDark);
    pendingQuickAction = readQuickAction(getIntent());
    if (getBridge() != null) attachNativeBridges(getBridge().getWebView());
    new Handler(Looper.getMainLooper()).postDelayed(this::hideSplashOverlay, 1600);
  }

  private void applyChrome(int navColor, boolean lightIcons) {
    getWindow().setNavigationBarColor(navColor);
    /* Fâșiile de sub bara de stare / navigare sunt padding-ul părintelui WebView-ului. */
    if (getBridge() != null && getBridge().getWebView() != null
      && getBridge().getWebView().getParent() instanceof View) {
      ((View) getBridge().getWebView().getParent()).setBackgroundColor(navColor);
    }
    getWindow().setStatusBarColor(Color.TRANSPARENT);
    WindowInsetsControllerCompat controller =
      WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    if (controller != null) {
      controller.setAppearanceLightNavigationBars(lightIcons);
      controller.setAppearanceLightStatusBars(lightIcons);
    }
  }

  /**
   * Trebuie apelat din Plugin.load() — înainte de loadUrl. Altfel
   * window.BugetFamilieReminders rămâne undefined pe sesiunea curentă.
   */
  void attachNativeBridges(WebView webView) {
    if (webView == null || nativeBridgesAttached) return;
    nativeBridgesAttached = true;
    webView.setBackgroundColor(Color.parseColor(launchDark ? "#0B0F0E" : "#E4E9E6"));
    final WebSettings settings = webView.getSettings();
    settings.setGeolocationEnabled(false);
    /* Pagina e în APK. Cache-ul WebView se golește o singură dată pe versiune,
       nu la fiecare deschidere: altfel JS-ul se recompilează de fiecare dată
       și a doua pornire e la fel de grea ca prima. */
    final int version = installedVersionCode();
    final android.content.SharedPreferences webCache = getSharedPreferences("bf_webview", MODE_PRIVATE);
    if (webCache.getInt("cache-version", -1) != version) {
      webView.clearCache(true);
      webCache.edit().putInt("cache-version", version).apply();
    }
    settings.setCacheMode(WebSettings.LOAD_DEFAULT);
    if (Build.VERSION.SDK_INT >= 23) {
      settings.setOffscreenPreRaster(true);
    }
    if (Build.VERSION.SDK_INT >= 26) {
      webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
    }
    /*
     * Textul mărit din setările telefonului ajunge și în pagină, dar plafonat: la 200% butoanele
     * și cifrele ieșeau din ecran. Între 85% și 130% aplicația rămâne întreagă și lizibilă.
     */
    final float fontScale = getResources().getConfiguration().fontScale;
    settings.setTextZoom(Math.round(Math.max(0.85f, Math.min(1.3f, fontScale)) * 100));
    settings.setSupportZoom(false);
    settings.setBuiltInZoomControls(false);
    settings.setDisplayZoomControls(false);
    webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
    disableForceDark(settings);
    webView.addJavascriptInterface(new QuickActionBridge(), "BugetFamilieQuickAction");
    webView.addJavascriptInterface(new ReminderBridge(), "BugetFamilieReminders");
    webView.addJavascriptInterface(new SplashBridge(), "BugetFamilieSplash");
    webView.addJavascriptInterface(new VoiceBridge(), "BugetFamilieVoice");
    ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
      final Insets bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
      );
      /* Edge-to-edge (targetSdk 36): WebView-ul nu primește inset-uri fiabile prin env()/JS
         (injecția se pierde la reîncărcarea paginii). Mutăm WebView-ul nativ între bara de
         stare și bara de navigare; pagina primește inset 0 și nu mai e acoperită. */
      if (view.getParent() instanceof View) {
        ((View) view.getParent()).setPadding(bars.left, bars.top, bars.right, bars.bottom);
      }
      injectSafeArea(webView, Insets.NONE);
      return WindowInsetsCompat.CONSUMED;
    });
    ViewCompat.requestApplyInsets(webView);
    webView.post(() -> ViewCompat.requestApplyInsets(webView));
    attachSplashOverlay(webView);
    webView.postDelayed(this::pruneStaleBackupCache, 2500);
  }

  /** Android nu recolorează pagina peste temele noastre și nu mai face o trecere în plus la desenare. */
  @SuppressWarnings("deprecation")
  private void disableForceDark(WebSettings settings) {
    if (Build.VERSION.SDK_INT >= 33) {
      settings.setAlgorithmicDarkeningAllowed(false);
    } else if (Build.VERSION.SDK_INT >= 29) {
      settings.setForceDark(WebSettings.FORCE_DARK_OFF);
    }
  }

  /** versionCode din APK, ca să golim cache-ul o dată după update, nu la fiecare pornire. */
  @SuppressWarnings("deprecation")
  private int installedVersionCode() {
    try {
      if (Build.VERSION.SDK_INT >= 28) {
        return (int) getPackageManager().getPackageInfo(getPackageName(), 0).getLongVersionCode();
      }
      return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
    } catch (PackageManager.NameNotFoundException error) {
      return 0;
    }
  }

  /**
   * Plic nativ, 240dp — aceeași mărime ca icoana splash de sistem.
   * Pe unele telefoane (Deschide din Fișiere) splash-ul de sistem e doar mint.
   * Stratul ăsta e deasupra WebView-ului până JS spune că First Run / Astăzi e gata.
   */
  private void attachSplashOverlay(WebView webView) {
    if (splashCover != null || webView == null) return;
    if (!(webView.getParent() instanceof ViewGroup)) return;
    final FrameLayout cover = new FrameLayout(this);
    cover.setBackgroundColor(Color.parseColor(launchDark ? "#0B0F0E" : "#E4E9E6"));
    cover.setClickable(true);
    final ImageView icon = new ImageView(this);
    icon.setImageResource(R.mipmap.ic_launcher_foreground);
    icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
    final int size = Math.round(240f * getResources().getDisplayMetrics().density);
    final FrameLayout.LayoutParams iconLp = new FrameLayout.LayoutParams(size, size);
    iconLp.gravity = Gravity.CENTER;
    cover.addView(icon, iconLp);
    ((ViewGroup) webView.getParent()).addView(
      cover,
      new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    );
    splashCover = cover;
    cover.post(() -> keepSplash = false);
  }

  private void hideSplashOverlay() {
    keepSplash = false;
    final View cover = splashCover;
    if (cover == null) return;
    splashCover = null;
    cover.setVisibility(View.GONE);
    if (cover.getParent() instanceof ViewGroup) {
      ((ViewGroup) cover.getParent()).removeView(cover);
    }
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    final String action = readQuickAction(intent);
    if (action != null) {
      pendingQuickAction = action;
      if (activityResumed) notifyWebQuickAction();
      else quickActionNotifyPending = true;
    }
  }

  /**
   * WebView-ul ține JS-ul, timer-ele și rasterul pornite în fundal dacă nu
   * îl pauzăm. Asta e memoria care umflă aplicația când treci la alt ecran.
   */
  /** Omul a cerut „Ascunde ecranul în capturi” (FLAG_SECURE permanent). Setat din plugin. */
  static volatile boolean userSecureScreen = false;

  @Override
  public void onPause() {
    /* Sub Android 13 nu există setRecentsScreenshotEnabled: ascundem ecranul cât aplicația e în
       fundal, ca lista de aplicații recente să nu arate registrul. La revenire scoatem steagul,
       dacă omul nu l-a cerut permanent (capturile rămân ale lui). */
    if (Build.VERSION.SDK_INT < 33) getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
    if (webView != null) {
      webView.onPause();
      webView.pauseTimers();
    }
    activityResumed = false;
    super.onPause();
  }

  @Override
  public void onResume() {
    super.onResume();
    if (Build.VERSION.SDK_INT < 33 && !userSecureScreen) getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
    final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
    if (webView != null) {
      webView.resumeTimers();
      webView.onResume();
    }
    activityResumed = true;
    if (quickActionNotifyPending && pendingQuickAction != null) {
      quickActionNotifyPending = false;
      notifyWebQuickAction();
    }
  }

  @Override
  public void onTrimMemory(int level) {
    super.onTrimMemory(level);
    final boolean tight = level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW
      || level == ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN;
    if (!tight) return;
    final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
    if (webView == null) return;
    /* În fundal eliberăm cache-ul din RAM. Pe disc rămâne, ca redeschiderea
       să nu recompileze pagina; la versiune nouă discul se golește la pornire. */
    if (level == ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN
      || level >= ComponentCallbacks2.TRIM_MEMORY_MODERATE) {
      webView.post(() -> webView.clearCache(false));
      pruneStaleBackupCache();
    }
    webView.post(() -> webView.evaluateJavascript(
      "try{window.dispatchEvent(new CustomEvent('buget-familie:trim-memory'))}catch(e){}",
      null
    ));
  }

  /**
   * Backup-urile de partajare stau în cache ca să le vadă foaia de share.
   * După o zi nu mai sunt necesare și umflau „Cache” din setările Android.
   */
  private void pruneStaleBackupCache() {
    final File cache = getCacheDir();
    if (cache == null) return;
    new Thread(() -> {
      final File[] files = cache.listFiles();
      if (files == null) return;
      final long cutoff = System.currentTimeMillis() - 24L * 60L * 60L * 1000L;
      for (File file : files) {
        if (file == null || !file.isFile()) continue;
        final String name = file.getName();
        if (!name.startsWith("buget-familie-backup-") || !name.endsWith(".json")) continue;
        if (file.lastModified() < cutoff) file.delete();
      }
    }, "bf-cache-prune").start();
  }

  /**
   * Dacă WebView-ul e deja în prim-plan, JS nu primește visibilitychange/focus.
   * Îl trezim să consume() — fără a pune acțiunea în string (doar un semnal).
   */
  private void notifyWebQuickAction() {
    final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
    if (webView == null) return;
    webView.post(() -> webView.evaluateJavascript(
      "try{window.dispatchEvent(new CustomEvent('buget-familie:quick-action'))}catch(e){}",
      null
    ));
  }

  private String readQuickAction(Intent intent) {
    if (intent == null) return null;
    final String action = intent.getStringExtra(QuickActions.EXTRA_ACTION);
    if (!QuickActions.isKnown(action)) return null;
    if (action.startsWith(QuickActions.ACTION_TEMPLATE_PREFIX)) return action;
    final String templateId = intent.getStringExtra(QuickActions.EXTRA_TEMPLATE_ID);
    if (templateId != null && !templateId.isEmpty() && QuickActions.ACTION_EXPENSE.equals(action)) {
      return QuickActions.ACTION_TEMPLATE_PREFIX + templateId;
    }
    return action;
  }

  private final class SplashBridge {
    @JavascriptInterface
    public void hide() {
      new Handler(Looper.getMainLooper()).post(() -> hideSplashOverlay());
    }

    @JavascriptInterface
    public void setChrome(String navHex, boolean lightIcons) {
      new Handler(Looper.getMainLooper()).post(() -> {
        try {
          final int color = Color.parseColor(navHex);
          applyChrome(color, lightIcons);
        } catch (Exception ignored) {
          /* hex invalid din JS — păstrăm culoarea curentă */
        }
      });
    }

    @JavascriptInterface
    public void persistTheme(boolean dark) {
      getSharedPreferences(PREFS_CHROME, MODE_PRIVATE).edit().putBoolean(PREF_DARK, dark).apply();
      new Handler(Looper.getMainLooper()).post(() -> {
        launchDark = dark;
        getWindow().setBackgroundDrawableResource(
          dark ? R.color.splash_background_dark : R.color.splash_background
        );
        final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
          webView.setBackgroundColor(Color.parseColor(dark ? "#0B0F0E" : "#E4E9E6"));
        }
      });
    }
  }

  /**
   * Singurul lucru pe care îl expune este numele acțiunii cerute, o singură dată.
   * publishTemplates scrie doar etichete pe widget — fără sume.
   */
  /**
   * Notarea din voce: WebView-ul nu are SpeechRecognition, așa că fraza trece prin dialogul de
   * recunoaștere al telefonului. Aplicația nu cere microfonul: îl folosește aplicația de voce.
   * Textul se întoarce paginii ca eveniment; pagina completează formularul, nu salvează nimic.
   */
  private final class VoiceBridge {
    @JavascriptInterface
    public boolean available() {
      try {
        return !getPackageManager()
          .queryIntentActivities(new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH), 0)
          .isEmpty();
      } catch (RuntimeException ignored) {
        return false;
      }
    }

    @JavascriptInterface
    public void listen(String lang) {
      MainActivity.this.runOnUiThread(() -> {
        final Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang == null || lang.isEmpty() ? "ro-RO" : lang);
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, getString(R.string.voice_prompt));
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        try {
          startActivityForResult(intent, REQ_VOICE);
        } catch (ActivityNotFoundException | SecurityException e) {
          notifyWebVoice(null, "unavailable");
        }
      });
    }
  }

  private void notifyWebVoice(String text, String error) {
    final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
    if (webView == null) return;
    final String detail = text != null
      ? "{text:" + JSONObject.quote(text) + "}"
      : "{error:" + JSONObject.quote(error == null ? "cancelled" : error) + "}";
    final String js = "try{window.dispatchEvent(new CustomEvent('buget-familie:voice',{detail:" + detail + "}))}catch(e){}";
    webView.post(() -> webView.evaluateJavascript(js, null));
    /* Pagina poate fi încă oprită imediat după dialog; ascultătorul ia doar primul eveniment. */
    webView.postDelayed(() -> webView.evaluateJavascript(js, null), 500);
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    if (requestCode == REQ_VOICE) {
      final ArrayList<String> results = resultCode == RESULT_OK && data != null
        ? data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
        : null;
      final String text = results != null && !results.isEmpty() ? results.get(0) : null;
      notifyWebVoice(text, text == null ? "cancelled" : null);
      return;
    }
    super.onActivityResult(requestCode, resultCode, data);
  }

  private final class QuickActionBridge {
    @JavascriptInterface
    public String consume() {
      final String action = pendingQuickAction;
      pendingQuickAction = null;
      return action == null ? "" : action;
    }

    /* JS așteaptă întoarcerea din metodă; scrierea și redesenarea widgetului se fac în fundal. */
    @JavascriptInterface
    public void publishTemplates(String json) {
      final android.content.Context app = MainActivity.this.getApplicationContext();
      WIDGET_WORK.execute(() -> {
        WidgetTemplates.saveJson(app, json);
        QuickAddWidgetProvider.updateAll(app);
      });
    }

    @JavascriptInterface
    public void publishSpendToday(String json) {
      final android.content.Context app = MainActivity.this.getApplicationContext();
      WIDGET_WORK.execute(() -> {
        SpendTodayWidgetProvider.save(app, json);
        SpendTodayWidgetProvider.updateAll(app);
      });
    }

    @JavascriptInterface
    public void publishShopping(String json) {
      final android.content.Context app = MainActivity.this.getApplicationContext();
      WIDGET_WORK.execute(() -> {
        ShoppingWidgetProvider.save(app, json);
        ShoppingWidgetProvider.updateAll(app);
      });
    }

    @JavascriptInterface
    public void publishWeek(String json) {
      final android.content.Context app = MainActivity.this.getApplicationContext();
      WIDGET_WORK.execute(() -> {
        WeekWidgetProvider.save(app, json);
        WeekWidgetProvider.updateAll(app);
      });
    }

    @JavascriptInterface
    public void publishEnvelopes(String json) {
      final android.content.Context app = MainActivity.this.getApplicationContext();
      WIDGET_WORK.execute(() -> {
        EnvelopesWidgetProvider.save(app, json);
        EnvelopesWidgetProvider.updateAll(app);
      });
    }
  }

  private void injectSafeArea(WebView webView, Insets bars) {
    final float density = getResources().getDisplayMetrics().density;
    int bottomPx = bars.bottom;
    /* Overlay 3 butoane (Huawei): systemBars.bottom e 0, dar bara acoperă WebView-ul. */
    final String top = (bars.top / density) + "px";
    final String right = (bars.right / density) + "px";
    final String bottom = (bottomPx / density) + "px";
    final String left = (bars.left / density) + "px";
    final String js =
      "(function(){var r=document.documentElement;"
        + "r.classList.add('capacitor-android');"
        + "r.style.setProperty('--safe-area-inset-top','" + top + "');"
        + "r.style.setProperty('--safe-area-inset-right','" + right + "');"
        + "r.style.setProperty('--safe-area-inset-bottom','" + bottom + "');"
        + "r.style.setProperty('--safe-area-inset-left','" + left + "');"
        + "r.style.setProperty('--os-inset-top','" + top + "');"
        + "r.style.setProperty('--os-inset-right','" + right + "');"
        + "r.style.setProperty('--os-inset-bottom','" + bottom + "');"
        + "r.style.setProperty('--os-inset-left','" + left + "');"
        + "})()";
    webView.evaluateJavascript(js, null);
  }

  boolean hasNotifyPermission() {
    if (Build.VERSION.SDK_INT < 33) return true;
    return ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
      == PackageManager.PERMISSION_GRANTED;
  }

  private void notifyWebNotifyPermission(boolean granted) {
    final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
    if (webView == null) return;
    final String js =
      "try{window.dispatchEvent(new CustomEvent('buget-familie:notify-permission',{detail:{granted:"
        + (granted ? "true" : "false")
        + "}}))}catch(e){}";
    webView.post(() -> webView.evaluateJavascript(js, null));
    /* WebView-ul e adesea pauzat cât e deschis dialogul de permisiune; repetăm după reluare. */
    webView.postDelayed(() -> webView.evaluateJavascript(js, null), 400);
    webView.postDelayed(() -> webView.evaluateJavascript(js, null), 1200);
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode != REQ_POST_NOTIFICATIONS) return;
    final boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
    notifyWebNotifyPermission(granted);
  }

  private final class ReminderBridge {
    @JavascriptInterface
    public void schedule(String payloadJson) {
      ReminderScheduler.scheduleJson(MainActivity.this.getApplicationContext(), payloadJson);
    }

    @JavascriptInterface
    public void cancelAll() {
      ReminderScheduler.cancelAll(MainActivity.this.getApplicationContext());
    }

    @JavascriptInterface
    public boolean hasPermission() {
      return MainActivity.this.hasNotifyPermission();
    }

    @JavascriptInterface
    public void requestPermission() {
      MainActivity.this.runOnUiThread(() -> {
        if (MainActivity.this.hasNotifyPermission()) {
          notifyWebNotifyPermission(true);
          return;
        }
        ActivityCompat.requestPermissions(
          MainActivity.this,
          new String[]{Manifest.permission.POST_NOTIFICATIONS},
          REQ_POST_NOTIFICATIONS
        );
      });
    }

    @JavascriptInterface
    public void notifyNow(String title, String body) {
      if (title == null || title.trim().isEmpty()) return;
      ReminderWorker.notifyNow(
        MainActivity.this.getApplicationContext(),
        title,
        body == null ? "" : body,
        4090
      );
    }
  }

}
