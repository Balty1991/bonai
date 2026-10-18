# Play listing helpers — Buget Familie (RO)

**Sursa de lipit în Play Console este [`play-store-listing-ro.md`](./play-store-listing-ro.md).** Acest fișier păstrează shot list-ul și blurb-ul Data safety.

Text gata de lipit în Play Console. **Fără upload fals în store.** Plățile (Play Billing) și App Check Enforce rămân afară. **Nu lipi prețuri IAP cât timp `BILLING_LIVE = false`.**

**Versiune pentru listing (sept 2026):** `1.1.69` / `versionCode` **71** (`package.json` + `android/app/build.gradle`). Textul lung de lipit e în `play-store-listing-ro.md`, nu aici.

## Identitate

| Câmp | Valoare |
|---|---|
| Nume | Buget Familie |
| Pachet | `ro.balty1991.bugetfamilie` |
| Categorie | Finance |
| Contact | contact.vanzo@gmail.com |
| Politică | https://balty1991.github.io/bonai/privacy.html |
| Termeni | https://balty1991.github.io/bonai/terms.html |
| Ștergere date | https://balty1991.github.io/bonai/delete-data.html |

## Descriere scurtă (≤80 caractere)

```
Plicuri pe ciclu de salariu, sync familie criptat — fără login bancar.
```

(72 caractere cu spații)

## Descriere completă

```
Buget Familie este registrul unei gospodării românești: fiecare leu are un loc până la următorul venit.

De ce e altfel
• Plicuri pe categorie, membru și sursă — card, cash, bonuri de masă, transfer comun.
• Fără login bancar și fără cont. Datele stau pe telefon.
• Sincronizare opțională între telefoane: o parolă de familie, pachet AES-GCM; serverul nu vede lei în clar.
• Astăzi: un număr de decizie — cât poți folosi fără să strici următoarea perioadă.
• Scor de sănătate, ritm zilnic, recapitulare de lună.
• El și ea: cine a mișcat banii, fără conturi separate.
• Bonuri scrise de mână, pe articole.
• De verificat: bonuri și CSV bancă (BCR, BT, ING, Revolut) confirmate înainte de registru.
• PDF de bilanț și CSV, generate în aplicație.
• Teme: Alb Atelier, Noapte, Aurora, Navy, Cyber — contrast verificat pe controale.
• Reamintiri locale pe orizont scurt (≤14 zile); la deschiderea aplicației se reprogramează. Fără spam WorkManager.

Aplicația nu plătește facturi, nu investește și nu înlocuiește un consultant. Este un atelier de decizii, în română, în lei.
```

## Feature bullets (Play „Despre această aplicație” / highlight)

1. Plicuri pe **ciclul vostru de salariu** (nu doar luna calendar) + tranșe săptămânale
2. Fără login bancar — date pe telefon; sync familie opțional, AES-GCM
3. Un număr clar pe Astăzi: ce poți cheltui azi, fără să strici perioada
4. El și ea: până la 6 membri, cine a scos din ce plic
5. Bon scris de mână → De verificat → registru
6. Import CSV bănci RO + dedupe (fără OAuth bancar)
7. Conflict onest pe plicuri și mișcări (nu LWW tăcut pe bani)
8. Widget / dală rapidă + PIN local + backup export/import

> Catalog Casa/Familia există în app; **nu** afișa prețuri IAP pe store până `BILLING_LIVE=true` (vezi `BILLING_PLAY_PREP.md`, `ROADMAP_PLAY_2026.md`).

## Listă capturi (screenshot shot list)

Ordine sugerată, telefon 1080×1920 sau similar, temă **Alb Atelier Platinum**:

1. **Astăzi** — hero cu o singură cifră de decizie + buton de captură
2. **Plan** — listă de plicuri cu stare în plan / aproape / depășit
3. **Mișcări** — jurnal pe zile + filtru Tip
4. **De verificat** — coadă bon/CSV înainte de registru
5. **Sync** — sesiune familie + „ce nu se sincronizează”
6. **Analiză / Gospodărie** — ritm sau scor sănătate
7. **Temă Noapte** (sau Aurora) — același Astăzi, contrast umplut
8. **Obligații** — scadențe + datorii (opțional)

Note captură: fără date reale ale utilizatorului; folosește demouri inventate; ascunde bare de sistem zgomotoase.

## Privacy blurb (Data safety / scurt pentru listing)

```
Datele financiare stau pe telefon. Sincronizarea între telefoanele familiei este opțională și criptată (AES-GCM) cu o parolă pe care doar voi o cunoașteți — dezvoltatorul nu poate citi sumele. Fără publicitate, fără vânzare de date, fără login bancar. Backupul sistem Android este dezactivat (allowBackup=false). Poți șterge totul din aplicație sau de pe pagina publică de ștergere.
```


## Asset-uri grafice (repo)

Director: [`docs/play-store-assets/`](./play-store-assets/)

| Fișier | Spec | Rol |
|---|---|---|
| `icon-512.png` | 512×512 | Icon Play (același plic ca iconul aplicației; `.svg` e o schiță veche, nu se încarcă) |
| `feature-graphic-ro.png` / `feature-graphic-en.png` | 1024×500 | Feature graphic Play, pe limbă |
| `screenshots/ro/`, `screenshots/en/` | 1080×1920 | 8 capturi cu text, pe limbă |
| `SCREENSHOTS.md` | — | Ordine capturi + cum se refac |

Brand: emerald/sage Premium (`#0F3D34` / `#143c36`, plic `#3AA87C`). Iconița și splash-ul Android din `android/app/src/main/res/` folosesc același limbaj vizual (adaptive + monochrome).

## Ce NU se face aici

- Nu se încarcă AAB/APK în Play din acest document
- Nu se activează Play Billing
- Nu se activează App Check **Enforce** (doar metrics, dacă e cazul)
