# Play Billing — implementat, oprit până la activare

**Stare (1.1.94):** codul e gata, dar oprit: `BILLING_LIVE = false` în `client/src/lib/entitlements.ts`.
Cât e `false`, toată lumea are Familia (perioada de testare), iar butoanele de cumpărare nu apar.

| Parte | Unde |
|---|---|
| Cumpărare / restaurare pe telefon | `client/src/lib/billing.ts` (plugin `@capgo/native-purchases`) |
| Dreptul la Familia, cu 3 zile de grație offline | `client/src/lib/billing-store.ts` |
| Butoane „Familia anual / lunar” și „Restaurează abonamentul” | `client/src/components/PremiumStudio.tsx` |
| Verificare pe server + confirmare (acknowledge) | funcția `verifyPlayPurchase` (`functions/src/index.ts`) |
| Anulări, rambursări, reînnoiri (RTDN) | funcția `playRtdn` |
| Familia pentru partener, prin camera familiei | `familyEntitlements/{roomId}`, scris doar de server |

## Pași de activare (în ordine)

1. **Play Console → Monetizare → Abonamente:** creează `familie_lunar` (plan de bază `lunar`, 19,99 lei/lună) și `familie_anual` (plan de bază `anual`, 149 lei/an). ID-urile planurilor de bază trebuie să fie exact acestea (`PLAY_BASE_PLANS`). Oferta de probă de **30 de zile** se pune pe planuri (aceeași cifră ca `TRIAL_DAYS` din `entitlements.ts`, pe care o arată ecranul de abonament).
2. **Play Console → Utilizatori și permisiuni:** invită contul de serviciu al funcțiilor (`<număr-proiect>-compute@developer.gserviceaccount.com` sau cel afișat la funcția `verifyPlayPurchase` în Google Cloud Console) cu dreptul „Vizualizează date financiare, comenzi și răspunsuri la anulări” și „Gestionează comenzi și abonamente”.
3. **Google Cloud Console:** activează **Google Play Android Developer API** pe proiectul `buget-familie-a6a0d`.
4. **Firestore → Rules:** lipește din nou `firestore.rules` (au apărut `familyEntitlements` și `playPurchases`).
5. **RTDN:** în Pub/Sub creează un topic (ex. `play-rtdn`), dă-i `google-play-developer-notifications@system.gserviceaccount.com` rolul Publisher, apoi un abonament **push** către `https://europe-central2-buget-familie-a6a0d.cloudfunctions.net/playRtdn`. **Obligatoriu:** la abonament bifează „Enable authentication” și alege un cont de serviciu (ex. `firebase-adminsdk-fbsvc@…`), cu audiența implicită (adresa funcției). Fără token OIDC valid, `playRtdn` ignoră cererea. **Obligatoriu și acesta:** în `functions/.env` pune `PLAY_RTDN_SERVICE_ACCOUNT=<contul ales>`; fără el, `playRtdn` refuză toate notificările (orice proiect Google poate emite un token pentru adresa funcției). În Play Console → Monetizare → Setări: numele topicului.
6. **Test închis:** adaugă testerii ca „license testers”, pune `BILLING_LIVE = true`, publică pe testare internă și verifică: cumpărare, restaurare pe alt telefon, partenerul din aceeași cameră primește Familia, anulare (RTDN o scoate).

---

## Product IDs (sugestie Play Console)

| SKU Play | Constantă client | Plan | Perioadă |
|---|---|---|---|
| `familie_lunar` | `PLAY_PRODUCT_IDS.familieMonth` | Familia | lună |
| `familie_anual` | `PLAY_PRODUCT_IDS.familieYear` | Familia | an |

Casa rămâne free (fără SKU). Family+ (29,99 / 229) — SKU-uri separate doar când P2 e justificat.

În Consolă: tip **Subscription**, bază RON, trial 30 de zile pe ambele SKU (`TRIAL_DAYS`), clear cancel path.

---

## Opțiuni plugin Capacitor (alege una la implementare)

1. **`@capgo/native-purchases`** — Billing Library 5+/6, API Capacitor 6–8; bun default pentru abonamente.
2. **`@revenuecat/purchases-capacitor`** — dacă vrei dashboard + entitlements server-side fără backend propriu.
3. **Cordova/community in-app-purchases** — de evitat pe Capacitor 8 (API vechi).

Pași tipici (local, pe clone):

```bash
pnpm add @capgo/native-purchases   # sau RevenueCat
npx cap sync android
```

Apoi: produse create în Play Console → license testers → internal/closed track cu Billing.

---

## Unde se agață `entitlements.ts`

Fișier: `client/src/lib/entitlements.ts`

| Export | Rol |
|---|---|
| `BILLING_LIVE` | Master switch. `false` → `currentPlan()` = `"familie"` (totul deblocat pentru test). |
| `PLANS` | Limite + prețuri catalog (Casa: plicuri fără limită, 2 persoane, 1 telefon; Familia 19,99 / 149, 6 persoane, 6 telefoane). |
| `PLAY_PRODUCT_IDS` | Mapare SKU → lună/an. |
| `TRIAL_DAYS` | 14 — copy UI + Play Console. |
| `formatPlanPriceRon` | UI catalog („19,99 lei/lună”). |
| `canAddEnvelope` / `canAddMember` / `canUseFamilySync` | Gate-uri soft când Billing e live. |

**Flux stub (acum):** UI (`PremiumStudio`) citește `PLANS` + mesaj „catalog / testare”; **nu** apelează purchase.

**Flux live (viitor):**

1. La start: `restorePurchases()` → mapează SKU activ la `PlanId`.
2. Persistă entitlement local (și opțional token Play) — **nu** șterge `AppData`.
3. `currentPlan()` citește entitlement dacă `BILLING_LIVE`, altfel Casa.
4. Soft paywall pe sync / plicuri > Casa / AI over-quota — **nu** pe captura de cheltuială.

---

## Restore / downgrade fără pierdere de date

| Eveniment | Comportament așteptat |
|---|---|
| Restore | Reîncarcă SKU-uri; dacă Familia e activ → unlock sync/plicuri; registrul local neschimbat. |
| Expirare / anulare | Downgrade la Casa: **păstrează** toate plicurile și mișcările; blochează doar *crearea* peste limită + sync nou. |
| Downgrade cu al doilea telefon sau >2 persoane | Sincronizarea se oprește pe telefoanele în plus; registrul și persoanele rămân. Mesaj clar: „datele rămân, sincronizarea revine cu Familia”. |
| Schimb device | Restore pe noul telefon înainte de a cere upgrade. |
| Conflict sync după expirare | Datele rămân pe telefon; sync push poate fi refuzat cu mesaj uman, nu wipe. |

Regulă de aur: **Billing controlează feature flags, nu ledger-ul.**

---

## Checklist înainte de `BILLING_LIVE = true`

- [ ] Closed testing ≥14 zile fără incidente sync/backup.
- [ ] SKU `familie_lunar` + `familie_anual` active în Consolă (draft OK pe internal).
- [ ] License testers pot cumpăra / anula / restore pe build semnat release.
- [ ] Soft paywall doar pe gate-uri Casa; cheltuiala rămâne free.
- [ ] Buton „Restaurează cumpărăturile” vizibil în catalog.
- [ ] Downgrade de la Familia testat manual: al doilea telefon nu mai sincronizează, nimic nu se șterge.
- [ ] Privacy **§11** actualizat (abonamente via Google Play; anulare din Play).
- [ ] Data safety + listing: prețuri IAP **doar acum** (nu înainte).
- [ ] `pnpm test` verde pe `entitlements.test.ts`.
- [ ] Feature flag: un singur commit care basculează `BILLING_LIVE` (ușor de revert).

---

## Reminder privacy §11

Cât `BILLING_LIVE === false`, privacy poate spune că nu se vând abonamente în app.  
**La go-live:** actualizează `client/public/privacy.html` §11 + termenii: plăți prin Google Play, probă de 30 de zile, anulare din abonamentele Google, datele financiare rămân pe dispozitiv după anulare.

---

## Ce nu e în acest prep

- Nu se comit secrete Play / service accounts.
- Nu se adaugă dependențe Billing în `package.json` din agent (fără install fiabil) — documentat aici pentru pasul local.
- Nu se activează fake charges în UI.

## BonAI: produse și verificare (oct. 2026)
- Abonamente în Play Console: `bonut_pro` și `bonut_familie`, fiecare cu planurile de bază `lunar` (9,99 / 14,99 lei) și `anual` (79,99 / 119,99 lei). Vechile `familie_lunar`/`familie_anual` rămân recunoscute pentru restaurare.
- **Fără ofertă de probă în Play**: proba de 14 zile pornește în aplicație de la al 3-lea bon. O ofertă de probă Play ar dubla-o.
- Serverul (`verifyPlayPurchase`) acceptă cele 4 produse; doar Familia se scrie în `familyEntitlements` (se împarte camerei). Pro rămâne pe telefonul care l-a cumpărat.
- Aplicația: `bonut_pro` → plan Pro, Familia/camera → plan Familie (`activePaidPlan`). Butoanele de cumpărare apar în paywall doar cu `BILLING_LIVE = true`, în aplicația Android.
- Risc cunoscut: limita de 15 scanări AI/lună e numărată doar pe telefon (localStorage), fără contor pe server.
- **Actualizare:** cota de 15 scanări AI/lună e acum ținută pe server, în `aiScanUsage/{uid}` (luna după ora României, tranzacție la fiecare scanare reușită). Proba pornește o singură dată pe telefon, la al 3-lea bon. Plătit = `uidEntitlements/{uid}` (scris la verificarea cumpărării, cu identitatea telefonului) sau `familyEntitlements/{roomId}`. Răspunsul scanării are `quota {plan, used, limit, remaining, month, enforced}`, iar aplicația își aliniază numărătoarea. Blocarea (HTTP 402 `ai_quota`) se pornește cu `AI_QUOTA_ENFORCED = true` în funcții, odată cu `BILLING_LIVE = true` în aplicație. Rămâne posibilă ocolirea prin reinstalare (identitate anonimă nouă), limitată de App Check și de limitele zilnice pe IP.
