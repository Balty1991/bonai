# BonAI — arhitectura retransformării (Pasul 0)

> **Poziționare:** „Lista de cumpărături care îți arată cât economisești.” (aliniat cu `rapoarte-buget-familie/11-cercetare-piata.md`)
>
> Din „Buget Familie” (buget cu plicuri) în **BonAI**: aplicația care știe ce cumperi, cât te costă fiecare produs, unde e mai ieftin și cum plătești mai puțin, automat.
> Document scris pe `main` @ 802e7fc (1.1.220), 18.10.2026. Deciziile sunt luate de echipă (delegare explicită de la Alin).

## 1. Audit (starea de azi)

| Zonă | Ce există | Verdict |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite, ~530 fișiere / ~69.000 linii în `client/src`, ~380 module în `lib/`, zeci de foi CSS istorice | **Păstrăm** stack-ul; rescriem doar shell-ul și ecranele noi. Rescrierea de la zero ar arunca parserul, sync-ul criptat, garanțiile și inflația personală, deja testate. |
| Android | Capacitor 8 (`android/`), `ro.balty1991.bugetfamilie`, AAB prin `release-android-aab.yml` | **Păstrăm**. `applicationId` NU se schimbă (schimbarea = aplicație nouă în Play, utilizatorii își pierd datele locale). Se schimbă doar numele afișat și iconul. |
| Model date | Local-first: `AppData` (finance-data.ts) pe telefon; sync de familie = un pachet AES-GCM în `familySync/{roomId}` (Firestore nu vede nimic în clar) | **Păstrăm** modelul criptat pentru datele personale. Datele publice (prețuri crowdsourced) merg separat, opt-in, anonimizate (v. §6). |
| Auth | Firebase Auth anonim (etapa 2, `firestore.auth.rules`) | Păstrăm; adăugăm Google Sign-In opțional pentru PRO/FAMILIE (restaurare pe telefon nou). |
| Functions | `functions/src/index.ts`: `readReceipt` (Gemini → Claude → Groq), `aiGuide`, `verifyPlayPurchase`, `playRtdn`, `appFeedback`; secrete prin `defineSecret` (citite o dată la pornire) | Păstrăm; `readReceipt` devine nucleul. Adăugăm `pricesIngest`, `shareList`, `weeklyMenu`, `pruneSecretVersions`. |
| Plată | `@capgo/native-purchases` + verificare server Play | Păstrăm; produse noi Pro/Familie (v. §9). |
| CI | Pages (check, lint, teste ×2 fusuri, build), AAB, functions, rules, e2e layout/sync | Păstrăm; adăugăm **corpusul de bonuri** cu prag de acuratețe (rulează în `pnpm test`). |
| Deja făcut de Alin (1.1.219–1.1.220) | Mod „shop” implicit: Acasă / Produse / Scanează / Magazine / Casa, inflația ta, shrinkflation, garanții și retururi, bugetul vechi sub „Buget (vechi)” | Bază bună; Pasul 1 îl duce la capăt. |

## 2. Concurența reală și poziționarea

Concurentul real e gratuit și de stat: **Monitorul Prețurilor la alimente** (Consiliul Concurenței: ~30.000 de produse, ~1.700 de magazine, aplicație cu nota ~2,0). Concluzie: **comparația de prețuri singură nu se poate vinde.** Abonamentul plătește partea personală: bonurile tale, inflația ta, gospodăria ta, economia dovedită.

**Monitorul Prețurilor ca sursă de pornire (cold start), ce am verificat:**
- Site-ul spune că prețurile au „caracter pur informativ”. Nu există licență de date deschise (nici pe data.gov.ro) și nici termeni pentru API.
- API-ul XML (`/pmonsvc/Retail/...`) e public și nedocumentat oficial; proiecte civice îl folosesc (gov2-ro/monitorulpreturilor).
- Termenii portalului Consiliului Concurenței interzic copierea, arhivarea și redistribuirea materialelor.
- **Decizia (aliniată cu cercetarea de piață):** fără preluare în masă și fără republicare. Facem doar căutări punctuale (un produs, la cererea omului), cu cache scurt (≤ 24 h) și atribuire vizibilă: „Sursa: Monitorul Prețurilor, Consiliul Concurenței, preț informativ”. Dacă sursa nu răspunde, cădem pe bonurile tale. Preluarea în masă rămâne oprită până la acordul scris.
- **Codul QR de pe bon (OUG 69/2024):** îl folosim ca să nu se salveze același bon de două ori și ca să verificăm totalul și data citite de model.
- Varianta inițială, păstrată pentru referință: Codul (`pricesIngest`) se scrie în spatele unui comutator `OFFICIAL_PRICES_ENABLED=false`. Pasul manual pentru Alin: un e-mail către Consiliul Concurenței care cere acordul de reutilizare (ciorna e în §13).
- Între timp, pornirea fără date se face din bonurile proprii și din cele ale familiei. **Nu inventăm niciodată prețuri.**

## 3. Nume și identitate

| Variantă | Pentru | Contra |
|---|---|---|
| **BonAI** ✅ | „bon” e cuvântul pe care îl caută românii („scanare bon”, „bon fiscal”); diminutivul sună prietenos, scurt, ușor de spus | diacritic: în Play se scrie „BonAI”, iar domeniul e `bonut.ro` |
| Coșar | coș de cumpărături | sună a meserie (coșar de hornuri) |
| Prețios | joc de cuvinte cu preț | adjectiv comun, greu de găsit în căutări |
| Cămăruța | cămară | lung, sugerează doar stocul |
| Bonar | scurt | rece, fără personalitate |

**Ales: BonAI**, cu titlul ASO în Play „BonAI: Listă de cumpărături și prețuri”. Disponibilitatea `bonut.ro` NU a putut fi verificată din cutie (whois-ul RoTLD nu răspunde). Pas manual: verificare și cumpărare pe rotld.ro. Rezervă: `bonut.app`.

- **Paletă:** smarald `#0F7B5F` (primar; continuă paleta adoptată în #104), mentă `#E6F4EE` (fundal carduri), cerneală `#14231E` (text), chihlimbar `#F2A93B` (economie, promoții), coral `#E5533D` (scumpiri, alerte), hârtie `#FAFAF7` (fundal). Contrast AA verificat pentru textul pe primar (alb pe `#0F7B5F` ≈ 5,3:1).
- **Tipografie:** Inter (deja locală) pentru UI; cifrele cu `tabular-nums`. Titlurile mari în Inter 800.
- **Icon:** un bon fiscal stilizat cu marginea zimțată, cu un ✓ sau o săgeată în jos ca o bifă, alb pe smarald, colțuri rotunjite. Iconurile din UI rămân Lucide, cu linie de 2 px.
- **Ton:** tu, direct, cald, fără jargon financiar. Spunem „ai dat”, „mai ieftin la”, „s-a scumpit”, nu „cheltuieli discreționare” sau „alocare”.

## 4. Arhitectura informației (sitemap)

Bara de jos are 5 locuri; „Scanează” e în centru, mai mare.

1. **Acasă:** costurile lunii vs media pe 3 luni · „Economisit cu BonAI” · cel mult 3 alerte · lista (câte produse sunt de luat) · ultimele bonuri · un sfat pe săptămână.
2. **Cumpărături:** Listă (GRATUITĂ, comună, cu prețuri estimate din istoricul tău) | Stoc | Coș optimizat (PRO) | Meniul săptămânii (PRO).
3. **Scanează:** camera direct · scanare cod de bare în magazin · galerie · PDF/e-mail · introducere rapidă → ecran de verificare → rezumat „aha”.
4. **Prețuri:** Produsele mele | Magazine | Inflația mea | Promoții.
5. **Cont:** profil + BonAI Pro | Bonuri | Toate costurile | Familie și membri | Garanții | Abonamente | Facturi | Export | Setări (Date și confidențialitate: „Descarcă datele vechi”) (în Setări: Arhiva veche, doar citire + export).

### Wireframe-uri (text)
- **Acasă:** `[Octombrie: 1.284 lei · −6% față de media pe 3 luni]` `[Economisit cu BonAI: 142 lei ▸ Distribuie]` `[⚠ Ulei Floriol +18% · Garanție TV: retur până joi]` `[Lista: 7 de luat ▸]` `[Bonuri recente ×3]` `[Sfatul săptămânii]`
- **Scanare cod de bare:** cameră pe tot ecranul → card jos: `Lapte Zuzu 1,5% 1L · 7,49 lei aici` / `Tu: ultima dată 6,99 la Lidl (12 oct)` / `Alte magazine (din bonurile familiei): …` / `[Adaugă în listă]`
- **Listă partajată:** produse grupate pe raion, cu estimare de preț ▸ `[Trimite pe WhatsApp]` → link `https://bonut.ro/l/<token>`; cine îl primește bifează din browser, fără cont.

## 5. Ce dispare și cum (curat, fără pierdere de date)

| Se scoate | Din UI | Din logică | Datele |
|---|---|---|---|
| Plicuri și bugete pe categorii (limite, plafoane, alerte) | da | da, la modulul 2 | arhivă, doar citire |
| Conturi, portofele, solduri | da | da | arhivă |
| Venituri, transferuri | da | da | arhivă |
| Obiective de economii cu sume | da | da | arhivă |
| Bani de buzunar, solduri între membri | da | da | arhivă |
| Import bancar / open banking | da | da | arhivă |

Categoriile rămân doar pentru analiză și filtre. Cheltuielile existente devin **costuri** (aceleași înregistrări, altă etichetă). Nimic nu se șterge din `AppData`: câmpurile vechi rămân în pachetul criptat, deci se sincronizează și se exportă în continuare.

**Migrarea (fără risc):**
- v1 (Pasul 1): modul vechi „budget” dispare din navigare, iar „Buget (vechi)” se mută în Setări → Arhivă. Zero scrieri în date, deci rollback = revert de commit.
- v2: `migrateToCosts(data)` e pură, testată și idempotentă; scrie `schemaVersion: 2` și păstrează o copie `legacyArchive`. Înainte de rulare se face automat o copie locală de siguranță (mecanismul de backup existent). Rollback: restaurare din copie, plus `legacyArchive` care rămâne intact.
- Nu e nevoie de migrare server-side: Firestore are doar pachete criptate, pe care serverul nu le poate citi.

## 6. Modelul de date

**Personal (în pachetul criptat, `AppData` v2):** `receipts[]` (magazin, dată, total, linii: produs, cantitate, unitate, gramaj, preț unitar, reducere, categorie, cod de bare), `products{}` (catalog normalizat: nume canonic, marcă, gramaj, EAN), `shoppingList[]`, `pantry[]`, `bills[]`, `subscriptions[]`, `warranties[]`, `members[]`, `settings`, `legacyArchive` (doar citire).

**Public (Firestore, separat, opt-in, anonim):**
- `prices/{ean}/obs/{id}`: `{ storeChain, city, price, unitPrice, date, source: "receipt" }`, fără uid și fără ora exactă (doar ziua).
- `products/{ean}`: catalogul public.
- `sharedLists/{token}`: lista partajată, cu token aleator de 128 de biți, expiră în 30 de zile; conține doar nume de produse și bife.
- `entitlements/{uid}`, `familyEntitlements/{roomId}`, `playPurchases/*` (doar serverul).

## 7. Cloud Functions

| Funcție | Rol | Stare |
|---|---|---|
| `readReceipt` | bon → JSON structurat (Gemini, Claude, Groq) | există |
| `verifyPlayPurchase`, `playRtdn` | abonamente | există; produse noi |
| `aiGuide` | asistentul | există |
| `appFeedback` | feedback | există |
| `contributePrice` | primește observații anonime (App Check, limită de rată) | nou |
| `shareList` / `sharedListTick` | link web pentru WhatsApp; bifarea fără cont | nou |
| `weeklyMenu` | meniul săptămânii optimizat pe cost (promoții + stocul casei), PRO | nou |
| `pricesIngest` (Scheduler) | sursă oficială, **oprită** până la acordul scris | nou, comutator |
| `pruneSecretVersions` (Scheduler, lunar) | păstrează ultimele 2 versiuni ale fiecărui secret | nou |

Secretele se citesc o singură dată, la pornirea instanței (`defineSecret`, valoare cache-uită la nivel de modul).

## 8. Fluxuri
- **Scanare:** poză → comprimare pe telefon → `readReceipt` → normalizare și potrivire în catalog → ecran de verificare → salvare în pachet → opt-in: observații anonime la `contributePrice` → rezumat „aha” („ai plătit cu 9 lei mai mult decât data trecută pe 3 produse”).
- **Cod de bare:** ML Kit Barcode (Capacitor, pe dispozitiv) → EAN → istoricul tău și al familiei (local) + observațiile publice (`prices/{ean}`) → card.
- **Sync gospodărie:** cel existent, criptat end-to-end, cu invitație QR.
- **Abonament:** Play Billing → `verifyPlayPurchase` → `entitlements` → funcțiile PRO deblocate; Familie se leagă de cameră.
- **Bucla virală:** lista ▸ WhatsApp ▸ link web ▸ cel care primește bifează ▸ CTA „Instalează BonAI”. Separat, cardul „Cât am economisit” se poate distribui.

## 9. Monetizare

| Plan | Preț | Ce include |
|---|---|---|
| GRATUIT | 0 | lista partajată + link web pe WhatsApp, widget, verificare cu codul de bare, ~15 scanări pe lună, rezumat lunar |
| PRO | **9,99 lei/lună** · **79,99 lei/an** (accent pe anual) | Inflația mea, „Economisit cu BonAI”, alerte de preț pe produsele tale, coș optimizat, meniul săptămânii, scanări nelimitate |
| FAMILIE | **14,99 lei/lună** · **119,99 lei/an** | PRO + până la 6 membri, garanții, facturi, abonamente |

Probă gratuită de **14 zile**, pornită automat după al **3-lea bon** scanat (omul a văzut deja valoarea).

## 10. Costuri estimate (1.000 de utilizatori activi pe lună)
- Citirea bonurilor: ~15 bonuri/utilizator × ~0,002 $ (Gemini Flash) ≈ 30 $/lună. Claude, folosit doar ca rezervă, adaugă ~10 $.
- Firestore + Functions: sub pragul gratuit sau sub 10 $/lună.
- Hosting pentru linkurile partajate (GitHub Pages / Firebase Hosting): 0–5 $.
- **Total ≈ 40–55 $/lună.** Pragul de rentabilitate: ~30 de abonați PRO.

## 11. Roadmap (reordonat: puține module, făcute impecabil)

Riscurile mari sunt **calitatea parserului** și **distribuția** (ASO, recenzii, „cât am economisit”).

| # | Pas | Depinde de |
|---|---|---|
| 0 | Acest document | — |
| 1 | Identitate BonAI, doar modul nou, bugetul vechi în Arhivă (doar citire + export), **corpus de bonuri cu acuratețe în CI** | 0 |
| 2 | Parser impecabil: normalizare RO (diacritice, gramaje, SGR, reduceri), corpus ≥ 50 de bonuri, prag ≥ 95% | 1 |
| 3 | Lista gratuită + partajare WhatsApp (link web, bifare fără cont) | 1 |
| 4 | Cod de bare în magazin (ML Kit) | 2 |
| 5 | Inflația mea + bonuri + Acasă finală + „Economisit” distribuibil | 2 |
| 6 | Monetizare Pro/Familie (paywall pe partea personală) | 5 |
| 7 | Widget Android (listă/alerte + scanare dintr-o atingere) | 3 |
| 8 | Migrarea v2 la costuri, curățarea codului vechi de buget | 6 |
| 9 | Garanții / abonamente / facturi (există parțial) | 8 |
| 10 | Stocul casei + meniul săptămânii optimizat pe cost | 3, 5 |
| 11 | Prețuri publice crowdsourced + Monitorul Prețurilor (doar cu acord) | 4 |
| 12 | Asistent AI, onboarding, polish, ASO | toate |

## 12. Imposibil sau doar manual (pentru Alin)
- Produsele de abonament în Play Console (`bonut_pro_monthly`, `bonut_pro_yearly`, `bonut_family_monthly`, `bonut_family_yearly`) și numele, iconul și capturile din fișa Play.
- Cumpărarea domeniului `bonut.ro`.
- Acordul scris al Consiliului Concurenței (ciorna e mai jos).
- Activarea Google Sign-In în consola Firebase și adăugarea SHA-1 pentru AAB.
- Secret Manager: rolul `secretmanager.admin` pentru contul de serviciu al funcției `pruneSecretVersions`.

## 13. Ciornă: cererea de acord către Consiliul Concurenței
Către: Consiliul Concurenței (registratura / e-mail public) · Subiect: Cerere de acord pentru reutilizarea datelor din Monitorul Prețurilor

> Bună ziua, dezvolt aplicația BonAI, care ajută familiile să urmărească prețurile produselor pe care le cumpără. Vă rog să-mi spuneți dacă datele publicate pe monitorulpreturilor.info pot fi reutilizate într-o aplicație mobilă, cu citarea sursei și cu actualizare cel mult zilnică, și în ce condiții (licență, frecvență, atribuire). Mulțumesc, Alin Baltescu.


## Coduri de bare: surse de nume (18.10.2026)
Ordinea: legătura învățată (cod → produs din bonuri) → produsele locale → surse deschise → „Nu-l recunosc”.
Cod: `client/src/lib/barcode-sources.ts` (cache local 30 zile pentru găsite, 3 zile pentru negăsite; 5 s pe sursă;
la 429 sursa se sare 10 minute; fără internet doar cache-ul). Cererile pleacă direct de pe telefon (CORS deschis, fără chei).

| Sursă | Licență | Uz comercial | Decizie |
|---|---|---|---|
| Open Food Facts (alimente, băuturi, alcool, dulciuri) | ODbL 1.0 | da, cu atribuire + share-alike pe date | **adăugată** (prima) |
| Open Pet Food Facts (hrană animale) | ODbL 1.0 | da | **adăugată** |
| Open Products Facts (casă, curățenie, electronice) | ODbL 1.0 | da | **adăugată** |
| Open Beauty Facts (cosmetice, igienă) | ODbL 1.0 | da | **adăugată** |
| Wikidata, proprietatea P3962 (GTIN) | CC0 1.0 | da | **adăugată** (ultima; ~3.000 de coduri) |
| UPCitemdb, endpoint „trial” | termenii acordă licență doar planurilor plătite | neclar/nu | respinsă |
| Open EAN/GTIN DB (opengtindb.org) | queryid cerut prin e-mail; date GFDL | nu fără înregistrare | respinsă |
| GS1 GEPIR / Verified by GS1 | termenii interzic reutilizarea/stocarea | nu | respinsă |
| Barcode Lookup, EAN-Search, EcomSource | cheie plătită (sau sandbox de test) | doar plătit | respinse |

Categoria BonAI se ia din `categories_tags` (en:waters → Apă, en:chocolates → Dulciuri, en:beers → Băuturi,
en:cat-food → Animale/Altele, en:shampoos → Sănătate, en:cleaning → Casă & facturi; altfel după bază: OPFF → Animale,
OBF → Sănătate, OPF → Casă & facturi). Atribuirea ODbL e în Setări → Despre BonAI.
