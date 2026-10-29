/**
 * Handoff splash nativ → primul cadru real.
 *
 * Pe APK, plicul NATIV (mărimea icoanei de sistem) stă până First Run /
 * hero-ul Astăzi / PIN sunt pictate cu umplutură opacă. Abia atunci
 * scoatem overlay-ul HTML (invizibil sub nativ) și, pe cadrul următor,
 * splash-ul nativ. Utilizatorul vede: plic → ecran gata.
 *
 * Nu scoatem nativul când #bf-boot e pictat — plicul HTML e altfel de
 * mare, deci se vede saltul și, o clipă, mint gol.
 */

export type SplashBridge = {
  hide?: () => void;
  setChrome?: (navHex: string, lightIcons: boolean) => void;
  persistTheme?: (dark: boolean) => void;
  /** Tema telefonului, de la Android: în WebView, prefers-color-scheme rămâne „light” (tema aplicației). */
  systemDark?: () => boolean;
};

/** Telefonul e pe tema închisă? În aplicația Android întreabă sistemul; în browser, prefers-color-scheme. */
export function systemPrefersDark(): boolean {
  try {
    const native = typeof window !== "undefined" ? window.BugetFamilieSplash?.systemDark : undefined;
    if (typeof native === "function") return Boolean(native.call(window.BugetFamilieSplash));
  } catch { /* punte indisponibilă: browserul */ }
  try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; }
}

declare global {
  interface Window {
    BugetFamilieSplash?: SplashBridge;
  }
}

let revealed = false;
let nativeHideTries = 0;
const afterReveal: Array<() => void> = [];

const READY_SELECTOR = ".bf-first-run, .os-hero, .bf-app-lock";

function paintThen(run: () => void, frames = 1) {
  const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : null;
  if (!raf || frames <= 0) {
    run();
    return;
  }
  raf(() => paintThen(run, frames - 1));
}

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function isOpaqueFill(bg: string): boolean {
  if (!bg) return false;
  const value = bg.trim().toLowerCase();
  if (!value || value === "transparent" || value === "rgba(0, 0, 0, 0)" || value === "rgba(0,0,0,0)") return false;
  const match = value.match(/^rgba?\(([^)]+)\)$/);
  if (match) {
    const parts = match[1].split(",").map((part) => part.trim());
    if (parts.length === 4 && Number(parts[3]) < 0.55) return false;
  }
  return true;
}

function nodePainted(node: Element): boolean {
  if (typeof (node as HTMLElement).getBoundingClientRect !== "function") return true;
  const box = node.getBoundingClientRect();
  if (box.height <= 48 || box.width <= 48) return false;
  try {
    if (typeof getComputedStyle !== "function") return true;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const needsFill = node.classList?.contains("bf-first-run") || node.classList?.contains("os-hero");
    if (needsFill && !isOpaqueFill(style.backgroundColor)) return false;
  } catch {
    /* jsdom / teste fără CSSOM */
  }
  return true;
}

function firstScreenReady(): boolean {
  if (typeof document === "undefined") return true;
  // P3-14: Astăzi își pune singur semnul după ce e pictat; fără el ar trebui să măsurăm (layout sincron).
  try {
    if (typeof performance !== "undefined" && typeof performance.getEntriesByName === "function" && performance.getEntriesByName("bf-today-painted").length) return true;
  } catch {
    /* fără Performance API: măsurăm ca înainte */
  }
  const list = typeof document.querySelectorAll === "function"
    ? document.querySelectorAll(READY_SELECTOR)
    : typeof document.querySelector === "function"
      ? [document.querySelector(READY_SELECTOR)].filter(Boolean)
      : [];
  for (let i = 0; i < list.length; i += 1) {
    const node = list[i];
    if (node && nodePainted(node)) return true;
  }
  return false;
}

function waitUntilPainted(run: () => void) {
  const started = nowMs();
  const tick = () => {
    /* 900ms: destul pentru CSS critic, nu 5s de plic. */
    if (firstScreenReady() || nowMs() - started > 900) {
      paintThen(run, 1);
      return;
    }
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : null;
    if (raf) raf(tick);
    else run();
  };
  tick();
}

function revealDom() {
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("bf-ready");
    document.getElementById("bf-boot")?.setAttribute("hidden", "");
  }
}

/** Scoate splash-ul nativ. Reîncearcă dacă puntea încă nu există. */
export function requestNativeHide() {
  try {
    if (typeof window !== "undefined" && window.BugetFamilieSplash?.hide) {
      window.BugetFamilieSplash.hide();
      nativeHideTries = 50;
      return;
    }
  } catch {
    /* puntea lipsește în browser */
  }
  nativeHideTries += 1;
  if (nativeHideTries < 40 && typeof setTimeout === "function") {
    setTimeout(requestNativeHide, 40);
  }
}

/** Potrivește bara de navigare Android cu dock-ul și reține tema pentru următoarea lansare. */
export function syncAndroidChrome() {
  try {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const dark = document.documentElement.classList.contains("dark");
    window.BugetFamilieSplash?.setChrome?.(dark ? "#12161C" : "#EEF1EF", !dark);
    window.BugetFamilieSplash?.persistTheme?.(dark);
  } catch {
    /* puntea lipsește în browser */
  }
}

/**
 * După primul cadru real: scoate overlay-ul HTML, apoi splash-ul nativ.
 * Nativul NU pleacă la apel — altfel se vede plicul HTML (altă mărime).
 */
export function hideNativeSplash() {
  if (revealed) return;
  revealed = true;
  waitUntilPainted(() => {
    syncAndroidChrome();
    revealDom();
    paintThen(() => {
      requestNativeHide();
      afterReveal.splice(0).forEach((fn) => {
        try {
          fn();
        } catch {
          /* foile amânate nu trebuie să blocheze ecranul */
        }
      });
    }, 1);
  });
}

/** Rulează după ce overlay-ul a fost ascuns (sau imediat, dacă deja e). */
export function onAppRevealed(fn: () => void) {
  const ready = typeof document !== "undefined" && document.documentElement.classList.contains("bf-ready");
  if (ready) {
    fn();
    return;
  }
  afterReveal.push(fn);
}

export function resetNativeSplashForTests() {
  revealed = false;
  nativeHideTries = 0;
  afterReveal.length = 0;
  if (typeof document !== "undefined") document.documentElement.classList.remove("bf-ready");
}
