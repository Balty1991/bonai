import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), "utf8");

describe("tokenii de temă", () => {
  const css = read("tokens.css");

  it("ține cele trei teme și scara de text", () => {
    for (const theme of ["theme-white", "theme-dark", "theme-navy"]) {
      expect(css).toContain(theme);
    }
    // Aurora și Cyber au fost scoase (se convertesc la Navy și Întunecat la pornire).
    expect(css).not.toContain("theme-aurora");
    expect(css).not.toContain("theme-cyber");
    expect(css).toContain("--bf-text-min: 12px");
    expect(css).toContain("--bf-hit: 44px");
    expect(css).toContain("--cf-primary: #176b54");
  });

  it("nu mai definește paletele și în foaia veche de teme", () => {
    const legacy = read("ui-themes-modern-2026.css");
    expect(legacy).not.toContain("--os-mint:#7cffc4!important");
    expect(legacy).not.toContain("--os-mint:#176b54!important");
    expect(legacy).toContain("tokens.css");
  });

  it("câștigă la finalul foilor amânate", () => {
    const deferred = read("deferred-styles.ts");
    const imports = [...deferred.matchAll(/import "\.\/([^"]+)";/g)].map((match) => match[1]);
    expect(imports.at(-7)).toBe("tokens.css");
    expect(imports.at(-6)).toBe("today.css");
    expect(imports.at(-5)).toBe("movements.css");
    expect(imports.at(-4)).toBe("plan.css");
    expect(imports.at(-3)).toBe("obligations.css");
    expect(imports.at(-2)).toBe("analysis.css");
    expect(imports.at(-1)).toBe("design-system-37.css");
  });
});

describe("plafonul de !important", () => {
  it("nu crește peste valoarea din re-audit", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, out);
        else out.push(full);
      }
      return out;
    };
    const count = walk(root)
      .filter((file) => file.endsWith(".css"))
      .reduce((sum, file) => sum + (readFileSync(file, "utf8").split("!important").length - 1), 0);
    // 8.344 la re-audit → 5.410 (curățenie verificată) → 3.819 (reguli moarte) → 3.426 (a doua rundă) → 3442 (ținte de atingere în @layer ds) → 3446 (eticheta de pe bannerul scadențelor, opacitatea etichetelor și a „RON”, descrierea temelor) → 3448 (codul de recuperare) → 3369 (reguli cu clase inexistente în cod) → 3364 (declarații umbrite în același fișier) → 3320 (temele Aurora și Cyber, trei texturi); vezi docs/CSS_IMPORTANT_CLEANUP.md.
    // Curățenia poate scădea numărul; o foaie nouă nu are voie să-l urce.
    // 27.09: 3263 după scoaterea regulilor moarte (clase care nu mai apar în cod).
    // 02.10: 3241 după clasele moarte (ghidul vechi, fotografiile de bon, pastilele din Analiză) și dungile din Mai mult.
    // 03.10: 3215 după declarațiile umbrite (vezi css-shadow.test.ts), dovedite cu 163 de instantanee de stil calculat.
    // 18.10: 3266. Designul BonAI (shop.css) trebuie să bată temele vechi marcate !important pe bara de sus/jos și butoane (+53); 57 de reguli moarte scoase (−3). Scade când temele vechi pleacă din arhivă.
    // 07.10: 3216, butonul ales Cheltuială / Venit din Notează: fundal și text împreună (textul ajungea verde pe verde sau alb pe alb).
    expect(count).toBeLessThanOrEqual(3266);
  });

  it("CSS-ul sursă nu crește: bugetul de mărime (P2-10 / D24)", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, out);
        else out.push(full);
      }
      return out;
    };
    const kb = walk(root).filter((file) => file.endsWith(".css")).reduce((sum, file) => sum + statSync(file).size, 0) / 1024;
    // 922 KB la 27.09. O funcție nouă își aduce stilul, dar pe mai departe se scoate cel vechi: plafonul nu urcă.
    // 29.09: 940, după Catalogul nou (căutare sus, bonul în card): toate regulile lui sunt folosite.
    // 02.10: 944, după Obligații (banda pe 30 de zile), notificări pe tipuri și setările cu căutare;
    // pe drum au ieșit selectorii temei „ink” și regulile dublate (~3 KB).
    // 02.10 (2): 946, pușculița copilului (borcanul, butoanele, formularul); nu mai sunt reguli moarte sau dublate.
    // 02.10 (3): 947, harta lunii din Mișcări; blocurile noi din sesiune sunt compactate.
    // 02.10 (4): 950, coșul estimat, fondul de urgență și modul vacanță (asistentul de final de lună refolosește cardul provocării).
    // 02.10 (5): 951, salutul și intrarea animată de pe Astăzi.
    // 03.10: 932, după 556 de declarații umbrite scoase (−19 KB) și cu graficele/tranzițiile noi (+1,5 KB).
    // 06.10: 936, cardul „cum plătește casa” (bilanțul și al doilea telefon). Regulile lui sunt folosite.
    // 08.10: 940, consultantul financiar din Analiză și ledurile cu numele celui care răspunde.
    // 08.10 (2): 943, verificarea cu fontul mare al telefonului: cadranul de pe Astăzi, salvarea automată cu butoane.
    // 17.10: 950, aplicația nouă a cumpărăturilor (shop.css: culorile, cardurile și bara ei).
    expect(kb).toBeLessThanOrEqual(950);
  });

  it("calc() are spații în jurul lui + și -", () => {
    // „calc(8px+var(...))” nu e respins la citire (are var()), dar devine invalid la calcul și
    // proprietatea cade la 0: bara de sus ajungea sub bara de stare pe Android.
    const root = fileURLToPath(new URL("..", import.meta.url));
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, out);
        else out.push(full);
      }
      return out;
    };
    const bad = walk(root)
      .filter((file) => file.endsWith(".css"))
      .flatMap((file) =>
        [...readFileSync(file, "utf8").matchAll(/calc\([^;{}]*?[\w%)](?:\+|-(?=var\(|env\(|\d))[\w(]/g)].map((m) => `${file}: ${m[0]}`),
      );
    expect(bad).toEqual([]);
  });
});

describe("ecranul Astăzi", () => {
  const css = read("today.css");

  it("nu lipește Notează și nu fixează zilele la 44px lățime", () => {
    expect(css).toContain("position: static");
    expect(css).not.toMatch(/position:\s*sticky/);
    expect(css).not.toMatch(/min-width:\s*44px/);
    expect(css).toContain("repeat(var(--bf-rhythm-days, 7), minmax(0, 1fr))");
    expect(css).toContain("--bf-text-min");
  });
});

describe("ecranul Mișcări", () => {
  const css = read("movements.css");

  it("ridică etichetele și sumele, fără să atingă butonul plus", () => {
    expect(css).toContain("--bf-text-min");
    expect(css).toContain("--bf-text-money");
    expect(css).toContain("--bf-hit");
    expect(css).toContain(".bf-movement-actions button");
    expect(css).not.toContain(".bf-movement-add");
    expect(css).not.toMatch(/position:\s*sticky/);
  });
});

describe("ecranul Plan", () => {
  const css = read("plan.css");

  it("ridică etichetele și sumele mici, fără să micșoreze cifra mare", () => {
    expect(css).toContain("--bf-text-min");
    expect(css).toContain("--bf-text-money");
    expect(css).toContain("--bf-hit");
    expect(css).toContain(".bf-plan-header-stat small");
    expect(css).not.toContain(".bf-plan-header-stat b");
    expect(css).not.toContain(".bf-plan-resource-band strong");
    expect(css).not.toContain(".bf-envelope-seal");
    expect(css).not.toMatch(/position:\s*sticky/);
  });
});

describe("ecranul Obligații", () => {
  const css = read("obligations.css");

  it("ridică etichetele și ratele, fără să micșoreze soldul mare", () => {
    expect(css).toContain("--bf-text-min");
    expect(css).toContain("--bf-text-money");
    expect(css).toContain("--bf-hit");
    expect(css).toContain(".bf-goals-link");
    expect(css).not.toContain(".bf-obligation-ledger article b");
    expect(css).not.toContain(".bf-debt-plan-total strong");
    expect(css).not.toContain(".bf-debt-simulator-result strong");
    expect(css).not.toContain(".bf-snowball-next strong");
    expect(css).not.toMatch(/position:\s*sticky/);
  });
});

describe("ecranul Analiză", () => {
  const css = read("analysis.css");

  it("ridică etichetele, fără să lățească lunile din grafic sau cifra mare", () => {
    expect(css).toContain("--bf-text-min");
    expect(css).toContain("--bf-text-money");
    expect(css).toContain("--bf-hit");
    expect(css).toContain(".bf-analysis-snapshot-stats small");
    expect(css).not.toContain(".bf-analysis-snapshot-stats b");
    expect(css).not.toContain(".bf-analysis-month-heading");
    expect(css).not.toContain(".bf-spend-donut b");
    expect(css).not.toMatch(/min-width:\s*var\(--bf-hit/);
    expect(css).not.toMatch(/position:\s*sticky/);
  });
});
