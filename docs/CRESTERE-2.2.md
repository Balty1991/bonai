# BonAI 2.2 — creștere: ce e în aplicație și ce faci tu în Play Console

## În aplicație (2.2.0)

| Idee | Unde |
|---|---|
| Coșul tău la fiecare magazin | Prețuri → Magazine; teaser pe Acasă când diferența trece de 5 lei/lună |
| Prețurile din orașul tău (opt-in) | Prețuri → Magazine → „Particip”; funcția `communityPrices` |
| Notificare „Unde e mai ieftin” | sâmbătă 10:00; Setări → Notificări |
| Recomandă BonAI | Cont → „Recomandă BonAI” |
| Primul bon („aha”) | cardul „DIN PRIMUL TĂU BON” de pe Acasă (exista) |
| Bonuri din e-mail / aplicații | dala E-bon de la scanare (exista) |

Funcția `communityPrices` se publică singură la push pe main (workflow-ul de funcții).
Colecțiile `communityPrices` și `communityQuota` sunt închise în reguli (implicit oricum refuzate).
Opțional, în Firestore → TTL: politică pe câmpul `expireAt` pentru `communityPrices` și `communityQuota`.

## Play Console → Siguranța datelor (după 2.2.0)

Adaugă la **Activitate în aplicație → Alte acțiuni** (sau „Istoricul achizițiilor in-app” nu se aplică):
- **Colectat: Da, opțional**, „Prețuri de produse din bonuri, anonime, agregate pe oraș și lună”.
- Partajat: **Nu**. Prelucrat efemer: **Nu** (se păstrează agregat, max. 100 de zile).
- Scop: **Funcționalitatea aplicației**. Utilizatorul poate refuza: **Da** (oprit implicit).

## Textele pentru magazin (Play)

**Titlu (30):** BonAI: bonuri și prețuri

**Descriere scurtă (80):** Scanezi bonul, vezi ce s-a scumpit și unde e mai ieftin coșul tău.

**Descriere lungă (început):**
Fă o poză la bon și BonAI citește fiecare produs, cu prețul lui. Vezi cât s-a scumpit exact ce cumperi tu, nu media țării, și la ce magazin ți-ar costa coșul lunar mai puțin.

- Coșul tău la fiecare magazin: aceleași produse, în cantitatea ta, la prețurile fiecăruia.
- Prețurile din orașul tău, dacă vrei: dai prețurile anonim și le primești pe ale celorlalți.
- Inflația ta, shrinkflation (mai puțin în pachet), reducerile de pe bon.
- Rapoarte pe săptămână, lună, trimestru și an; ratele, creditele, abonamentele și facturile separat.
- Lista de cumpărături comună cu familia, garanții și retururi cu bonul păstrat.
- Datele rămân pe telefoanele familiei, criptate. Fără cont, fără bancă.

**Capturi (ordinea):** 1. Acasă cu totalul lunii · 2. Scanarea bonului · 3. Coșul la fiecare magazin ·
4. Pagina produsului (cât s-a scumpit) · 5. Rapoarte · 6. Lista comună · 7. Datorii cu bifa ratei.
Text pe capturi, scurt: „Unde e mai ieftin coșul tău”, „Cât s-a scumpit ce cumperi tu”, „Bonul, citit în 5 secunde”.

**Video (20–30 s):** poză la bonul Lidl → lista de produse apare → „Lapte +12% în 3 luni” →
Magazine: „La Penny ai da cu 38 lei mai puțin pe lună” → „Spune-le prietenilor” → logo BonAI.

## Plățile (Pro / Familie)

Pașii sunt în `docs/BILLING_PLAY_PREP.md`. Pentru BonAI: abonamentele `bonut_pro` și `bonut_familie`
în Play Console → Monetizare, contul de serviciu invitat, Android Developer API pornit, RTDN, apoi
`BILLING_LIVE = true` doar după test cu license testers. Până atunci rămâne `false`.
