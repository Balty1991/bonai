/**
 * Cumpărare și restaurare Familia prin Google Play (testarea cu utilizatori: Billing,
 * validare pe server, restaurare). Pluginul se încarcă doar în aplicația Android.
 *
 * Fiecare achiziție e verificată de funcția `verifyPlayPurchase`, care întreabă Google Play
 * și, dacă telefonul e într-o cameră de familie, dă beneficiul și celorlalte telefoane.
 */
import { BILLING_LIVE, PLAY_BASE_PLANS, PLAY_PRODUCT_IDS } from "@/lib/entitlements";
import { saveEntitlement } from "@/lib/billing-store";
import { BONUT_SKUS } from "@/lib/bonut-plans";
import { isNativeApp } from "@/lib/app-storage";
import { t } from "@/lib/i18n";

const VERIFY_URL = "https://europe-central2-buget-familie-a6a0d.cloudfunctions.net/verifyPlayPurchase";
const SKUS: string[] = [...Object.values(PLAY_PRODUCT_IDS), BONUT_SKUS.pro.productId, BONUT_SKUS.familie.productId];

export type BillingResult = { ok: boolean; message: string };

/** Camera în care e conectat telefonul; o achiziție de aici dă Familia tuturor telefoanelor din ea. */
let activeRoomId: string | undefined;
export const setActiveFamilyRoom = (roomId: string | undefined) => { activeRoomId = roomId; };
/** Camera familiei în care e conectat acum telefonul (undefined fără sync). */
export const getActiveFamilyRoom = () => activeRoomId;

type VerifyResponse = { active: boolean; productId?: string; expiresAt?: string; error?: string };

async function verifyOnServer(purchaseToken: string, productId: string, roomId?: string): Promise<VerifyResponse> {
  const response = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ purchaseToken, productId, roomId }),
  });
  const body = await response.json().catch(() => ({})) as VerifyResponse;
  if (!response.ok) throw new Error(body.error || t("Verificarea abonamentului nu a răspuns. Încearcă din nou."));
  return body;
}

const remember = (result: VerifyResponse, roomId?: string) => {
  if (result.active && result.expiresAt) {
    saveEntitlement("play", { productId: result.productId, roomId, expiresAt: result.expiresAt, verifiedAt: new Date().toISOString() });
    return true;
  }
  saveEntitlement("play", undefined);
  return false;
};

const roomAccountId = async (roomId: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`bf-room:${roomId}`))), (byte) => byte.toString(16).padStart(2, "0")).join("");

const unavailable = (): BillingResult | undefined => {
  if (!BILLING_LIVE) return { ok: false, message: t("Abonamentele nu sunt încă active. În perioada de testare, Familia e deschisă pentru toți.") };
  if (!isNativeApp()) return { ok: false, message: t("Abonamentul se cumpără din aplicația de pe Android (Google Play).") };
  return undefined;
};

export async function buyFamilie(period: "month" | "year", roomId = activeRoomId): Promise<BillingResult> {
  return buyPlay(period === "month" ? PLAY_PRODUCT_IDS.familieMonth : PLAY_PRODUCT_IDS.familieYear, PLAY_BASE_PLANS[period === "month" ? PLAY_PRODUCT_IDS.familieMonth : PLAY_PRODUCT_IDS.familieYear], roomId);
}

/** BonAI Pro sau Familie: un abonament cu plan de bază lunar/anual (BONUT_SKUS). Familia se dă și camerei. */
export async function buyBonut(plan: "pro" | "familie", period: "month" | "year", roomId = activeRoomId): Promise<BillingResult> {
  const sku = BONUT_SKUS[plan];
  return buyPlay(sku.productId, sku.basePlans[period], plan === "familie" ? roomId : undefined);
}

async function buyPlay(productId: string, planIdentifier: string, roomId?: string): Promise<BillingResult> {
  const blocked = unavailable();
  if (blocked) return blocked;
  try {
    const { NativePurchases, PURCHASE_TYPE } = await import("@capgo/native-purchases");
    const transaction = await NativePurchases.purchaseProduct({
      productIdentifier: productId,
      planIdentifier,
      productType: PURCHASE_TYPE.SUBS,
      quantity: 1,
      // Amprenta camerei (fără date personale): serverul refuză mutarea abonamentului în altă cameră.
      ...(roomId ? { appAccountToken: await roomAccountId(roomId) } : {}),
    });
    if (!transaction.purchaseToken) return { ok: false, message: t("Google Play nu a trimis confirmarea cumpărării.") };
    const active = remember(await verifyOnServer(transaction.purchaseToken, productId, roomId), roomId);
    return active
      ? { ok: true, message: productId === BONUT_SKUS.pro.productId ? t("BonAI Pro e activ. Mulțumim!") : t("Familia e activă. Mulțumim!") }
      : { ok: false, message: t("Plata nu a fost confirmată de Google Play. Dacă ai fost taxat, apasă „Restaurează abonamentul”.") };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : t("Cumpărarea nu a reușit.") };
  }
}

/** „Restaurează abonamentul”: telefon nou, reinstalare sau plată care n-a apucat să fie confirmată. */
export async function restoreFamilie(roomId = activeRoomId): Promise<BillingResult> {
  const blocked = unavailable();
  if (blocked) return blocked;
  try {
    const { NativePurchases, PURCHASE_TYPE } = await import("@capgo/native-purchases");
    await NativePurchases.restorePurchases().catch(() => undefined);
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS });
    const ours = purchases.filter((item) => item.purchaseToken && SKUS.includes(item.productIdentifier));
    for (const purchase of ours) {
      if (remember(await verifyOnServer(purchase.purchaseToken!, purchase.productIdentifier, roomId), roomId)) {
        return { ok: true, message: purchase.productIdentifier === BONUT_SKUS.pro.productId ? t("Abonamentul BonAI Pro a fost restaurat.") : t("Abonamentul Familia a fost restaurat.") };
      }
    }
    saveEntitlement("play", undefined);
    return { ok: false, message: t("Nu am găsit un abonament activ pe contul Google de pe acest telefon.") };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : t("Restaurarea nu a reușit.") };
  }
}

/** Beneficiul primit prin camera familiei: abonamentul altui membru, validat pe server. */
export async function refreshRoomEntitlement(roomId: string): Promise<void> {
  if (!BILLING_LIVE) return;
  try {
    const { fetchFamilyEntitlement } = await import("@/lib/realtime-sync");
    const found = await fetchFamilyEntitlement(roomId);
    saveEntitlement("room", found && Date.parse(found.expiresAt) > Date.now() ? { roomId, expiresAt: found.expiresAt, verifiedAt: new Date().toISOString() } : undefined);
  } catch {
    // Fără rețea păstrăm ce știam; perioada de grație acoperă câteva zile.
  }
}
