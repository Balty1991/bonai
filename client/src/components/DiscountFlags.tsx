/** „Verifică reducerile”: rândurile de pe bon mai scumpe decât te așteptai, cu cifrele tale. */
import { AlertTriangle } from "lucide-react";
import type { DiscountFlag } from "@/lib/discount-check";
import { t } from "@/lib/i18n";

const lei = (value: number) => `${value.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00a0lei`;
const day = (iso?: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("ro-RO", { day: "numeric", month: "short" }) : "");

export function DiscountFlags({ flags }: { flags: ReadonlyArray<DiscountFlag> }) {
  if (!flags.length) return null;
  const total = flags.reduce((sum, flag) => sum + flag.diff, 0);
  return <section className="bn-flags" aria-label={t("Verifică reducerile")}>
    <p className="bn-flags-head"><AlertTriangle size={18} aria-hidden="true" /> <b>{t("Verifică reducerile")}</b><span>{t("+{amount} față de așteptări", { amount: lei(total) })}</span></p>
    <ul>{flags.map((flag) => <li key={`${flag.kind}-${flag.label}`}>
      <b>{flag.label}</b>
      <span>{flag.kind === "shelf"
        ? t(flag.promo ? "Pe bon {charged}, la raft era promoție la {expected} ({date})." : "Pe bon {charged}, la raft era {expected} ({date}).", { charged: lei(flag.charged), expected: lei(flag.expected), date: day(flag.date) })
        : t("Pe bon {charged}, cu {pct}% peste ultima dată aici ({expected}, {date}). Poate n-a trecut o reducere.", { charged: lei(flag.charged), expected: lei(flag.expected), pct: flag.pct, date: day(flag.date) })}</span>
    </li>)}</ul>
    <p className="bn-flags-note">{t("Arată bonul la Informații și cere diferența dacă prețul de la raft era mai mic.")}</p>
  </section>;
}
