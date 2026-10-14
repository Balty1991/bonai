# Play checklist — validare pe telefon

Nu putem testa widgetul / dala pe un dispozitiv fizic în mediul de build. Înainte de încărcarea pe Google Play, verifică pe un telefon Android:

## Widget (ecran principal)

- [ ] Adaugă widgetul „Buget Familie — Captură rapidă” pe home screen
- [ ] Butonul **Cheltuială** deschide captura rapidă (foaia de sumă)
- [ ] Butonul **Bon** deschide formularul de bon
- [ ] Apăsarea pe titlul/widget root deschide **Astăzi**
- [ ] Cu aplicația deja deschisă în fundal, widgetul tot livrează acțiunea (fără a pierde intent-ul)
- [ ] Widgetul **nu** afișează sume (privacy pe ecranul de start)
- [ ] Dacă ai șabloane de cheltuială: apar până la **3 etichete** pe widget (fără sume); o apăsare deschide captura cu șablonul selectat
- [ ] Fără șabloane, rândul de șabloane pe widget rămâne ascuns

> **Hardware necesar:** widgetul, șabloanele pe widget și dala nu pot fi validate în CI — bifează pe un telefon Android real după `cap:sync` / APK debug.
>
> **Cod (1.1.67):** dacă aplicația e în fundal, WebView-ul e pauzat. Acțiunea se ține și JS e anunțat **după** `onResume`, nu din `onNewIntent` (evenimentul se pierdea). În prim-plan se anunță imediat. Tot trebuie bifat pe telefon.

## Widget „Poți cheltui azi” (nou în 1.1.96)

> Codul Java s-a compilat local față de API-ul Android, dar construcția completă (Gradle + SDK) se face doar în GitHub Actions. Rulează **Build Android APK** înainte de testare.

- [ ] Adaugă widgetul „Poți cheltui azi” — arată cifra zilei și zilele până la salariu
- [ ] După o cheltuială notată în aplicație, cifra de pe widget se schimbă
- [ ] Dacă aplicația n-a fost deschisă azi, widgetul spune că cifra e de ieri (nu arată o sumă veche ca actuală)
- [ ] Butonul de pe widget deschide captura de cheltuială; apăsarea pe widget deschide Astăzi

## Ce plătim lunar și repartizarea (nou în 1.1.96)

- [ ] Plan → „Ce plătim lunar”: două venituri (zile diferite), câteva cheltuieli, una pe săptămână
- [ ] Notează primul salariu → pe Astăzi apare propunerea; „Aplică repartizarea” creează plicurile
- [ ] Al doilea salariu completează doar ce a rămas; „Anulează” pune plicurile la loc
- [ ] Plăți rare: adaugă „RCA”, apoi verifică rândul „Plăți rare” în propunere
- [ ] O cheltuială „Bolt” ajunge în Taxi, „Catena” în Neprevăzute
- [ ] Notificări: seara, pentru săptămâna care merge repede; duminică 19:30, bilanțul
- [ ] „Trimite pe WhatsApp” din bilanț deschide WhatsApp cu textul gata

## Dala Setări rapide

- [ ] Adaugă dala din Setări rapide → Editează → Buget Familie
- [ ] O apăsare deschide captura rapidă de cheltuială
- [ ] Funcționează pe Android 14+ (PendingIntent) și pe 10–13

## App Check (Firebase)

Detalii: `docs/app-check-enforce-prep.md` · env: `.env.example`

- [ ] `VITE_RECAPTCHA_SITE_KEY` setat pe build-ul de release **sau** cheia lipită în `firebase-config.ts`
- [ ] App Check → provider reCAPTCHA Enterprise pe app-ul web/Android din Firebase
- [ ] Metrics arată tokenuri **valide** pe build-ul pe care îl testezi
- [ ] **Nu** activa Enforce pe Firestore până confirmi tokenuri pe build-ul publicat
- [ ] Pentru debug Capacitor: `VITE_APPCHECK_DEBUG=true` + debug token în Console


## Reamintiri WorkManager (Android)

> **Orizont 14 zile:** `ReminderScheduler` programează OneTimeWork pe un orizont scurt (≤14 zile), max 6 lucrări, fără spam. Facturile / salariile peste 14 zile **nu** primesc reminder până la redeschiderea app — la open se reprogramează ferestrele apropiate. Nu bifa hardware aici din CI.


- [ ] Cu alertele activate, închide aplicația: o tranșă care începe mâine / salariu aproape ar trebui să notifice (orizont scurt, fără spam)
- [ ] **Activează alertele** cere permisiunea sistemului (Android 13+) și trimite imediat o notificare „Reamintiri active”. Fără text `pnpm` / `cap sync` pe ecran.
- [ ] Canalul „Reamintiri plan” apare în Setări sistem → Aplicații → Buget Familie → Notificări
- [ ] Widgetul / dala rămân neschimbate (probe hardware pe telefon — vezi secțiunile de mai sus)

## Sync / dispozitive

- [ ] Generează parola o dată pe telefonul A, introdu-o pe B
- [ ] Lista de dispozitive arată ambele telefoane cu „ultima dată văzut”
- [ ] Revocarea unui telefon închide sesiunea pe acel aparat la următorul sync
- [ ] Conflict de sumă pe același plic: badge pe Plan + Păstrează local / remote / Anulează

## Listing Play (notă)

În descrierea magazinului: menționează widgetul și dala din Setări rapide pentru adăugare rapidă fără sume pe ecranul de start. Text gata de lipit: `docs/play-store-listing-ro.md`.

Abonamentele Casa (gratuit) / Familia (19,99 lei/lună sau 149 lei/an) se adaugă **după** o versiune stabilă pe Play — `BILLING_LIVE` rămâne `false` în acest build. Nu simula plăți.

## Closed testing (obligatoriu înainte de producție)

Play cere testers reali, nu doar CI.

- [ ] AAB semnat, `versionCode` 218 / `versionName` 1.1.217, pachet `ro.balty1991.bugetfamilie`
- [ ] Privacy, terms, delete-data publicate pe GitHub Pages
- [ ] Data safety completat (financiare pe dispozitiv, sync opțional AES-GCM, fără ads)
- [ ] Financial features: evidență, nu sfat de investiții / credit / plăți
- [ ] 12+ testers pe lista closed, 14 zile consecutive
- [ ] Pe un telefon real: widget, dală, reminder, sync două telefoane, captură taxi din plic (nu „nealocat”)
- [ ] Nicio pierdere de date la Resetare / reinstalare / anulare viitoare de abonament
