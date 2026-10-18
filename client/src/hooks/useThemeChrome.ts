/**
 * Temă, fundal, contrast și program automat — efecte pe documentElement + localStorage.
 */
import { useEffect, useRef, useState } from "react";
import {
  LIGHT_THEMES,
  automaticTheme,
  backgroundOptions,
  currentLocalMinutes,
  defaultScheduleTimes,
  type BackgroundId,
  type ThemeId,
  type ThemeSchedule,
  type ThemeScheduleTimes,
} from "@/pages/home-kit";
import { ALL_THEME_CLASS_IDS, resolveInitialTheme } from "@/lib/theme-default";
import { safeSetItem } from "@/lib/safe-storage";
import { syncAndroidChrome } from "@/lib/native-splash";
import { applyTint, readTint } from "@/lib/theme-tint";

export function useThemeChrome() {
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(() => resolveInitialTheme(window.localStorage));
  const [themeSchedule, setThemeSchedule] = useState<ThemeSchedule>(() => {
    // BonAI (2.0.3): toată lumea pornește pe Automat (după telefon), o singură dată; apoi alegerea omului rămâne.
    if (!window.localStorage.getItem("bonai:look-v1")) { safeSetItem(window.localStorage, "bonai:look-v1", "1"); return "system"; }
    const saved = window.localStorage.getItem("buget-familie:theme-schedule");
    if (saved === "auto" || saved === "system" || saved === "manual") return saved;
    // Cine a ales deja o temă o păstrează; cine vine acum urmează telefonul (luminos/întunecat).
    return window.localStorage.getItem("buget-familie:setup-complete") ? "manual" : "system";
  });
  const [prefersDark, setPrefersDark] = useState(() => { try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; } });
  useEffect(() => {
    if (themeSchedule !== "system") return;
    let query: MediaQueryList | undefined;
    try { query = window.matchMedia("(prefers-color-scheme: dark)"); } catch { return; }
    const onChange = () => setPrefersDark(query!.matches);
    onChange();
    query.addEventListener?.("change", onChange);
    return () => query?.removeEventListener?.("change", onChange);
  }, [themeSchedule]);
  const [background, setBackground] = useState<BackgroundId>(() => {
    const saved = window.localStorage.getItem("buget-familie:background");
    return backgroundOptions.some((item) => item.id === saved) ? (saved as BackgroundId) : "plain";
  });
  const previousBackgroundRef = useRef<BackgroundId>(background);
  const backgroundTransitionReady = useRef(false);
  // Fără o alegere salvată, contrastul ridicat urmează setarea telefonului („Mărește contrastul”).
  const [highContrast, setHighContrast] = useState(() => {
    const saved = window.localStorage.getItem("buget-familie:high-contrast");
    if (saved === "true" || saved === "false") return saved === "true";
    try { return window.matchMedia("(prefers-contrast: more)").matches; } catch { return false; }
  });
  const [scheduleTimes, setScheduleTimes] = useState<ThemeScheduleTimes>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("buget-familie:theme-schedule-times") || "null") as Partial<ThemeScheduleTimes> | null;
      return {
        dayStart: typeof saved?.dayStart === "string" ? saved.dayStart : defaultScheduleTimes.dayStart,
        eveningStart: typeof saved?.eveningStart === "string" ? saved.eveningStart : defaultScheduleTimes.eveningStart,
        nightStart: typeof saved?.nightStart === "string" ? saved.nightStart : defaultScheduleTimes.nightStart,
      };
    } catch {
      return defaultScheduleTimes;
    }
  });
  /**
   * Cu „Comută automat”, tema depinde de oră: fără un semnal, aplicația lăsată deschisă peste 21:00
   * rămânea pe Alb până la următoarea redesenare. Verificăm la fiecare minut și la revenirea în aplicație.
   */
  const [clockMinutes, setClockMinutes] = useState(() => currentLocalMinutes());
  useEffect(() => {
    if (themeSchedule !== "auto") return;
    const tick = () => setClockMinutes(currentLocalMinutes());
    const timer = window.setInterval(tick, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    tick();
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", tick); };
  }, [themeSchedule]);
  const activeTheme = themeSchedule === "auto" ? automaticTheme(clockMinutes, scheduleTimes) : themeSchedule === "system" ? (prefersDark ? "dark" : "white") : theme;
  const previousThemeRef = useRef<ThemeId>(activeTheme);
  const themeTransitionReady = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    const previous = previousThemeRef.current;
    const apply = () => {
      root.classList.remove(...ALL_THEME_CLASS_IDS.map((id) => `theme-${id}`));
      root.classList.add(`theme-${activeTheme}`);
      root.classList.toggle("dark", !LIGHT_THEMES.includes(activeTheme));
      syncAndroidChrome();
    };
    const changing = themeTransitionReady.current && previous !== activeTheme;
    // Unde browserul știe View Transitions, tema nouă se topește peste cea veche dintr-o singură bucată.
    const viewTransition = (document as Document & { startViewTransition?: (update: () => void) => unknown }).startViewTransition;
    if (changing && viewTransition && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      viewTransition.call(document, apply);
      previousThemeRef.current = activeTheme;
      return;
    }
    apply();
    if (changing) {
      root.classList.remove("theme-transitioning");
      root.classList.add("theme-transitioning");
      const timer = window.setTimeout(() => root.classList.remove("theme-transitioning"), 420);
      previousThemeRef.current = activeTheme;
      return () => window.clearTimeout(timer);
    }
    themeTransitionReady.current = true;
    previousThemeRef.current = activeTheme;
  }, [activeTheme]);

  useEffect(() => {
    safeSetItem(window.localStorage, "buget-familie:theme", theme);
  }, [theme]);
  useEffect(() => {
    safeSetItem(window.localStorage, "buget-familie:theme-schedule", themeSchedule);
  }, [themeSchedule]);
  useEffect(() => {
    safeSetItem(window.localStorage, "buget-familie:theme-schedule-times", JSON.stringify(scheduleTimes));
  }, [scheduleTimes]);

  useEffect(() => {
    const root = document.documentElement;
    const previous = previousBackgroundRef.current;
    if (backgroundTransitionReady.current && previous !== background) {
      root.classList.remove(
        "background-transitioning",
        "background-from-plain",
        "background-from-paper",
        "background-from-grid",
        "background-from-aurora",
        "background-from-dots",
      );
      root.classList.add("background-transitioning", `background-from-${previous}`);
      const timer = window.setTimeout(() => root.classList.remove("background-transitioning", `background-from-${previous}`), 520);
      previousBackgroundRef.current = background;
      return () => window.clearTimeout(timer);
    }
    backgroundTransitionReady.current = true;
    previousBackgroundRef.current = background;
  }, [background]);

  useEffect(() => {
    document.documentElement.classList.remove("background-plain", "background-paper", "background-grid", "background-aurora", "background-dots");
    document.documentElement.classList.add(`background-${background}`);
    safeSetItem(window.localStorage, "buget-familie:background", background);
  }, [background]);

  useEffect(() => {
    document.documentElement.classList.toggle("bf-high-contrast", highContrast);
    // Se salvează doar când diferă de setarea telefonului, ca să o urmeze dacă omul n-a ales altceva.
    let system = false;
    try { system = window.matchMedia("(prefers-contrast: more)").matches; } catch { /* fără media query */ }
    if (highContrast !== system || window.localStorage.getItem("buget-familie:high-contrast") !== null) safeSetItem(window.localStorage, "buget-familie:high-contrast", String(highContrast));
  }, [highContrast]);

  useEffect(() => { applyTint(readTint()); }, []);

  useEffect(() => {
    const openTheme = () => setThemePickerOpen(true);
    window.addEventListener("buget-familie:open-theme", openTheme);
    return () => window.removeEventListener("buget-familie:open-theme", openTheme);
  }, []);

  return {
    themePickerOpen,
    setThemePickerOpen,
    theme,
    activeTheme,
    setTheme,
    themeSchedule,
    setThemeSchedule,
    background,
    setBackground,
    highContrast,
    setHighContrast,
    scheduleTimes,
    setScheduleTimes,
  };
}
