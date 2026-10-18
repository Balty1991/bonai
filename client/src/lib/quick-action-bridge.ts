/**
 * Puntea dintre widgetul Android / dala din Setări rapide și aplicația web.
 *
 * Nativul nu împinge nimic către pagină: la o pornire rece pagina nu există încă,
 * iar un mesaj trimis atunci s-ar pierde. În schimb, nativul reține acțiunea cerută,
 * iar pagina o ridică singură când e gata și de fiecare dată când revine în prim-plan.
 *
 * Șabloanele pe widget: doar id + etichetă (fără sume). JS publică ultimele 3
 * cheltuieli locale; nativul le arată pe widget și le întoarce ca „template:&lt;id&gt;”.
 */
export type QuickAction =
  | "expense"
  | "receipt"
  | "today"
  | "voice"
  | "shopping"
  | { kind: "template"; templateId: string };

const KNOWN = new Set(["expense", "receipt", "today", "voice", "shopping"]);

type NativeBridge = {
  consume?: () => string;
  publishTemplates?: (json: string) => void;
  publishSpendToday?: (json: string) => void;
  publishEnvelopes?: (json: string) => void;
  publishWeek?: (json: string) => void;
  publishShopping?: (json: string) => void;
};

const bridge = (): NativeBridge | undefined => {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { BugetFamilieQuickAction?: NativeBridge }).BugetFamilieQuickAction;
};

const parseAction = (value: string | undefined): QuickAction | undefined => {
  if (!value) return undefined;
  if (KNOWN.has(value)) return value as Exclude<QuickAction, { kind: "template" }>;
  if (value.startsWith("template:")) {
    const templateId = value.slice("template:".length).trim();
    return templateId ? { kind: "template", templateId } : undefined;
  }
  return undefined;
};

/** Întoarce acțiunea cerută o singură dată; nativul o uită imediat ce a fost citită. */
export function consumeQuickAction(): QuickAction | undefined {
  try {
    return parseAction(bridge()?.consume?.());
  } catch {
    return undefined;
  }
}

/**
 * Publică pe widget ultimele șabloane de cheltuială (id + etichetă, fără sume).
 * Pe web / fără punte nativă nu face nimic.
 */
export function publishWidgetTemplates(templates: Array<{ id: string; label: string }>): void {
  try {
    const payload = JSON.stringify(
      templates
        .filter((item) => item.id && item.label.trim())
        .slice(0, 3)
        .map((item) => ({ id: item.id, label: item.label.trim().slice(0, 28) })),
    );
    publishLater("templates", payload, (value) => bridge()?.publishTemplates?.(value));
  } catch {
    /* widgetul e opțional */
  }
}

/**
 * Puntea către widget e sincronă: JS stă până Android scrie și redesenează widgetul. Se chema
 * la fiecare schimbare din registru, deci fiecare notare aștepta după ecranul principal al
 * telefonului. Trimitem doar ce s-a schimbat, după ce ecranul s-a liniștit.
 */
const lastSent = new Map<string, string>();
const pendingSend = new Map<string, ReturnType<typeof setTimeout>>();
function publishLater(key: string, payload: string, send: (payload: string) => void) {
  if (lastSent.get(key) === payload) return;
  const waiting = pendingSend.get(key);
  if (waiting) clearTimeout(waiting);
  pendingSend.set(key, setTimeout(() => {
    pendingSend.delete(key);
    if (lastSent.get(key) === payload) return;
    lastSent.set(key, payload);
    try { send(payload); } catch { /* widgetul e opțional */ }
  }, 700));
}

/**
 * Ascultă acțiunile venite din afara aplicației. Verifică la montare, la fiecare
 * revenire în prim-plan și când nativul semnalează `buget-familie:quick-action`
 * (widget/dală cu aplicația deja vizibilă — altfel onNewIntent se pierde).
 * Dacă puntea nativă întârzie (WebView Capacitor), reîncearcă scurt — altfel o
 * apăsare pe widget la pornire rece se pierdea.
 */
export function observeQuickActions(handle: (action: QuickAction) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  let stopped = false;
  let retries = 0;
  const check = () => {
    const action = consumeQuickAction();
    if (action) handle(action);
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") check();
  };
  const boot = () => {
    if (stopped) return;
    if (bridge()) {
      check();
      return;
    }
    if (retries < 20) {
      retries += 1;
      window.setTimeout(boot, 100);
    }
  };
  boot();
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", check);
  window.addEventListener("buget-familie:quick-action", check);
  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", check);
    window.removeEventListener("buget-familie:quick-action", check);
  };
}

/** `zone`: fusul familiei, ca widgetul să schimbe ziua odată cu aplicația, nu cu ceasul telefonului. */
export type SpendTodayWidget = { amount: string; caption: string; date: string; stale: string; zone?: string };

/**
 * Cifra zilei pentru widgetul „Poți cheltui azi”. Widgetul nu calculează nimic: arată ce
 * publică aplicația, iar dacă data nu mai e azi, afișează `stale` în locul explicației.
 * Pe web sau fără punte nativă nu face nimic.
 */
export function publishSpendToday(payload: SpendTodayWidget): void {
  try {
    if (!bridge()?.publishSpendToday) return;
    publishLater("spend-today", JSON.stringify(payload), (value) => bridge()?.publishSpendToday?.(value));
  } catch {
    /* widgetul e opțional */
  }
}

/** Rândurile widgetului „Plicurile mele”: nume, cât a rămas (text gata format) și procentul consumat. */
export type EnvelopesWidget = { rows: Array<{ label: string; left: string; used: number }>; date: string; stale: string; zone?: string };

/** Ca la „Poți cheltui azi”: widgetul doar arată; fără punte nativă, nu face nimic. */
export function publishEnvelopes(payload: EnvelopesWidget): void {
  try {
    if (!bridge()?.publishEnvelopes) return;
    publishLater("envelopes", JSON.stringify(payload), (value) => bridge()?.publishEnvelopes?.(value));
  } catch {
    /* widgetul e opțional */
  }
}

/** Widgetul „Săptămâna banilor”: zilele (desenate de Android ca bare), totalul și o frază. */
export type WeekWidget = { days: Array<{ label: string; amount: number; short: string; heat: number; today: boolean }>; total: string; caption: string; date: string; stale: string; zone?: string };

export function publishWeek(payload: WeekWidget): void {
  try {
    if (!bridge()?.publishWeek) return;
    publishLater("week", JSON.stringify(payload), (value) => bridge()?.publishWeek?.(value));
  } catch {
    /* widgetul e opțional */
  }
}

/** Widgetul BonAI: primele produse din listă (doar text, fără sume) și câte mai sunt. */
export type ShoppingWidget = { items: string[]; count: string };

export function shoppingWidgetData(todo: ReadonlyArray<{ text: string }>, countLabel: (n: number) => string): ShoppingWidget {
  return { items: todo.slice(0, 4).map((item) => item.text.trim()).filter(Boolean), count: todo.length ? countLabel(todo.length) : "" };
}

export function publishShopping(payload: ShoppingWidget): void {
  try {
    if (!bridge()?.publishShopping) return;
    publishLater("shopping", JSON.stringify(payload), (value) => bridge()?.publishShopping?.(value));
  } catch {
    /* widgetul e opțional */
  }
}
