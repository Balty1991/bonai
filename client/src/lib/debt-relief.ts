/**
 * Ce se eliberează și ce e pe minus, în Obligații.
 *
 * Ratele mici de la eMAG (fierul de călcat, lamele, telefonul) se încheie în una-două luni; din
 * acel moment rămân ~480 lei pe lună fără loc. Fără un semn, banii se topesc în cheltuieli
 * mărunte. Iar dobânda de overdraft e urmărită „lunar, fără dată de final”, dar suma folosită din
 * overdraft se vede doar ca sold pe minus al cardului: o arătăm lângă dobândă.
 */
import { amortize } from "./debt-plan";
import { sourceBalance, type AppData, type Debt } from "./finance-data";

export type EndingDebt = { debt: Debt; months: number };

/** Ratele care se încheie în cel mult `within` luni (cu dobânda lor, dacă e știută). */
export function endingDebts(data: AppData, within = 3): EndingDebt[] {
  return data.debts
    .filter((debt) => !debt.openEnded && debt.remaining > 0.005 && debt.monthly > 0)
    .map((debt) => ({ debt, months: amortize(debt.remaining, debt.annualRate, debt.monthly).months ?? Number.POSITIVE_INFINITY }))
    .filter((item) => item.months <= within)
    .sort((a, b) => a.months - b.months || b.debt.monthly - a.debt.monthly);
}

/** Cât rămâne liber pe lună după ce se încheie toate ratele de mai sus. */
export const freedPerMonth = (items: EndingDebt[]) => Math.round(items.reduce((sum, item) => sum + item.debt.monthly, 0) * 100) / 100;

/** Cardurile (nu bonuri sau cash) ale aceleiași persoane care sunt acum pe minus: overdraftul folosit. */
export function overdraftInUse(data: AppData, debt: Debt): Array<{ name: string; used: number }> {
  return data.settings.paymentSources
    .filter((source) => source.kind === "card" && (!debt.memberId || source.memberId === debt.memberId))
    .map((source) => ({ name: source.name, used: Math.round(-sourceBalance(data, source.id) * 100) / 100 }))
    .filter((item) => item.used > 0.005);
}
