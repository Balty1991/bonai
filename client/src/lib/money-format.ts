/**
 * O singură formă pentru sume în lei, peste tot în aplicație: zecimale doar când există bani mărunți
 * („6.606 RON”, „184,50 RON”). Înainte, fiecare componentă avea formatul ei și cele mai multe
 * rotunjeau la leu, așa că aceeași sumă apărea „6.606 RON” în Plan și „6.605,70 RON” în Mișcări.
 */
import { getLocale } from "@/lib/i18n";

/** Același formatter, cu „lei” după sumă (spațiu nedespărțitor, ca Intl la „RON”). */
export const withLei = (base: Intl.NumberFormat): Intl.NumberFormat => ({ format: (value: number) => `${base.format(value)}\u00a0lei` }) as Intl.NumberFormat;

const cache = new Map<string, Intl.NumberFormat>();
const formatter = (locale: string, cents: boolean) => {
  const key = `${locale}|${cents}`;
  let format = cache.get(key);
  if (!format) {
    // În română scriem „lei”, ca pe bon și în vorbire, nu codul „RON”.
    format = locale.startsWith("ro")
      ? withLei(new Intl.NumberFormat(locale, { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }))
      : new Intl.NumberFormat(locale, { style: "currency", currency: "RON", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
    cache.set(key, format);
  }
  return format;
};

export function lei(value: number): string {
  let amount = Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
  if (Object.is(amount, -0)) amount = 0;
  return formatter(getLocale(), !Number.isInteger(amount)).format(amount);
}

/** Rotunjit în jos la ban: o cifră de cheltuit nu promite niciodată mai mult decât există. */
export const floorCents = (value: number) => (Number.isFinite(value) && value > 0 ? Math.floor(value * 100 + 1e-6) / 100 : 0);

/**
 * Singura regulă pentru „pe zi”: banii rămași împărțiți la zile, rotunjit în jos la ban.
 * Plicul, ritmul săptămânii, calendarul și ghidul o folosesc toate, ca să spună aceeași cifră.
 */
export const perDay = (remaining: number, days: number) => floorCents(remaining / Math.max(1, days));
