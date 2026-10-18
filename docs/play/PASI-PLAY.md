# Pași în Google Play Console — BonAI 2.1.0 (226)

Aplicația existentă **ro.balty1991.bugetfamilie** (fostă „Buget Familie”) primește o **actualizare**: nume nou, fișă nouă, AAB nou. ID-ul nu se schimbă, deci utilizatorii actuali primesc update-ul și își păstrează datele.

Fișierele din acest folder:
- `bonai-2.1.0-226.aab` — pachetul semnat (din GitHub Actions)
- `titlu.txt`, `descriere-scurta.txt`, `descriere-completa.txt`, `note-versiune-ro.txt`
- `icon-512.png` (512×512), `feature-graphic-1024x500.png`, `screenshots/01…08.png` (1080×1920)
- `DATA-SAFETY.md`, `CONTENT-RATING.md`

---

## 1. Fișa magazinului (rename + listare nouă)
1. play.google.com/console → alege aplicația **Buget Familie**.
2. Meniu stânga: **Creștere → Prezența în magazin → Fișa principală a magazinului** (Main store listing).
3. **Numele aplicației:** `BonAI: bonuri și cumpărături`
4. **Descriere scurtă:** conținutul din `descriere-scurta.txt`.
5. **Descriere completă:** conținutul din `descriere-completa.txt`.
6. **Pictograma aplicației:** încarcă `icon-512.png` (înlocuiește-o pe cea veche).
7. **Grafica recomandată:** `feature-graphic-1024x500.png`.
8. **Capturi de ecran telefon:** șterge capturile vechi, apoi încarcă `screenshots/01-acasa.png` … `08-ce-urmeaza.png`, în ordinea numerelor.
9. Tablete: dacă există capturi vechi de tabletă cu „Buget Familie”, șterge-le (sunt opționale).
10. **Salvează**. Dacă ai și traducere în engleză a fișei, actualizează și numele de acolo, altfel rămâne vechiul nume în EN.
11. **Detalii din magazin** (Store settings): Categorie **Cumpărături**; e-mail de contact `contact.vanzo@gmail.com`; site opțional `https://balty1991.github.io/buget-familie/`.

> Schimbarea numelui + iconului + capturilor intră la recenzie împreună cu versiunea. Nu folosi în fișă „cel mai bun”, „#1” sau numele lanțurilor (Lidl, Kaufland…) — motiv de respingere.

## 2. Conținutul aplicației (Policy → App content)
1. **Politica de confidențialitate:** `https://balty1991.github.io/buget-familie/privacy.html` (acum BonAI, v2.1.0). Salvează.
2. **Siguranța datelor:** Gestionează → completează după `DATA-SAFETY.md` → Trimite.
3. **Clasificarea conținutului:** refă chestionarul după `CONTENT-RATING.md` (s-au schimbat funcțiile: cumpărături în aplicație).
4. **Public țintă, Reclame, Acces la aplicație, Funcții financiare:** verifică după `CONTENT-RATING.md` → „Alte secțiuni”.
5. **Permisiuni:** aplicația cere acum **CAMERA** (bon + cod de bare) și **POST_NOTIFICATIONS** (reamintiri). Nu e nevoie de declarație specială pentru ele.

## 3. Testare internă (întâi)
1. **Testare → Testare internă** → **Creează o versiune nouă**.
2. Încarcă `bonai-2.1.0-226.aab`. Play trebuie să arate *versionCode 226, versionName 2.1.0*.
3. **Numele versiunii:** `2.1.0 (226)`.
4. **Note de versiune:** lipește `note-versiune-ro.txt` (cu etichetele `<ro-RO>`).
5. **Salvează → Examinează versiunea → Lansează în testarea internă**.
6. **Testeri:** fila *Testeri* → listă de e-mailuri (al tău + 1–2 din familie) → copiază **linkul de înscriere** și deschide-l pe telefon → **Devino tester** → instalează din Play.
7. Pe telefon verifică minim: scanare bon (AI și offline), cod de bare (permisiunea camerei), notificări, tema luminoasă/noapte, că datele vechi sunt păstrate, că numele și iconul sunt BonAI.

## 4. Producție
1. **Testare internă → versiunea 226 → Promovează versiunea → Producție** (nu reîncărca AAB-ul).
2. Notele în RO se păstrează; verifică-le.
3. **Lansare treptată (staged rollout):** începe cu **20%**, crește la 50% → 100% după 1–2 zile fără erori (Play Console → Calitate → Android vitals + Sentry).
4. **Examinează versiunea → Începe lansarea în producție**. Recenzia Google durează de obicei 1–3 zile (mai mult la schimbare de nume/icon).
5. **Publicarea gestionată** (Publishing overview): dacă e pornită, după aprobare apasă tu **Publică**.

## 5. Abonamentele bonut_pro și bonut_familie
> Produsele se pot crea oricând (chiar acum), dar **nu porni plățile în aplicație** până nu există și sunt active. Cât `BILLING_LIVE = false` în aplicație și `AI_QUOTA_ENFORCED = false` pe server, nimeni nu e taxat și nimeni nu e blocat.

Precondiție: profil de plăți (Merchant) activ: **Setări → Profil de plăți**. Fără el, meniul Abonamente nu e disponibil.

Pentru fiecare abonament:
1. **Monetizare → Produse → Abonamente → Creează abonament.**
2. **ID produs:** `bonut_pro` (respectiv `bonut_familie`) — exact așa; ID-ul nu se mai poate schimba. **Nume:** `BonAI Pro` (respectiv `BonAI Familie`).
3. Descriere/beneficii (max 4 beneficii):
   - Pro: „Scanări AI nelimitate”, „Inflația ta și istoric complet de prețuri”, „Alerte de preț și coș optimizat”, „Meniu săptămânal”.
   - Familie: „Tot ce are Pro”, „Pentru toată familia, până la 6 membri” *(de confirmat)*, „Listă, stoc și cheltuieli comune”, „Garanții, facturi și abonamente comune”.
4. **Adaugă plan de bază** → ID `lunar` → **Reînnoire automată**, perioadă **1 lună**, perioadă de grație 7 zile (implicit), reabonare permisă.
   - Prețuri → **Setează prețuri** → România: **Pro 9,99 lei**, **Familie 14,99 lei** → pentru celelalte țări alege „actualizează după cursul de schimb” sau dezactivează-le dacă vrei doar RO.
   - **Activează** planul.
5. **Adaugă plan de bază** → ID `anual` → Reînnoire automată, **1 an** → România: **Pro 79,99 lei**, **Familie 119,99 lei** → **Activează**.
6. **Oferte: NU crea nicio ofertă** (nicio „Probă gratuită” / „free trial” / preț introductiv). Proba de 14 zile pornește în aplicație după al 3-lea bon; o ofertă Play ar dubla-o. Dacă Play propune automat o ofertă, n-o salva.
7. Salvează. Verifică în listă: `bonut_pro` → planuri `lunar`, `anual` active; `bonut_familie` → `lunar`, `anual` active.

### Pornirea plăților (pas separat, după ce produsele sunt active)
1. Testează cumpărarea cu un **cont de tester de licență** (Setări → Testarea licențelor → adaugă e-mailul): cumpără, restaurează, anulează.
2. Apoi, într-un singur commit: `BILLING_LIVE = true` (client/src/lib/entitlements.ts) și `AI_QUOTA_ENFORCED = true` (functions/src/index.ts) + deploy funcții + AAB nou (versionCode 227).
3. Actualizează în aceeași versiune §14 din politica de confidențialitate și termenii (plăți active), plus Siguranța datelor dacă e cazul.

## Recomandare acum
- Versiunea 226 pleacă **cu plățile oprite** (`BILLING_LIVE = false`, `AI_QUOTA_ENFORCED = false`): toată lumea are planul complet. Corect, pentru că produsele `bonut_pro`/`bonut_familie` nu sunt încă create/testate.
- Descrierea Play **nu** menționează prețuri până nu pornesc plățile (altfel e afirmație înșelătoare). Când pornesc, adaugă la descriere secțiunea de abonamente (Pro 9,99/79,99 lei, Familie 14,99/119,99 lei, probă 14 zile de la al 3-lea bon, anulare din Google Play).
