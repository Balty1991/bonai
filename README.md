# Buget Familie

**Buget Familie** este o aplicație PWA pentru administrarea banilor proprii sau ai unei gospodării. Interfața este publicată prin GitHub Pages, iar sincronizarea protejată, complet opțională și în timp real, salvează doar un pachet financiar criptat într-un Firestore Firebase separat, izolat per familie printr-o parolă comună.

## Stare Play (sept 2026)

Versiune **1.1.217** / `versionCode` **218**. Billing **off** (`BILLING_LIVE=false`). Text de lipit: [`docs/play-store-listing-ro.md`](docs/play-store-listing-ro.md). Capturi: [`docs/play-store-assets/SCREENSHOTS.md`](docs/play-store-assets/SCREENSHOTS.md).

## Funcții implementate

| Domeniu | Funcție disponibilă |
|---|---|
| Spațiu de lucru mobil | Navigație primară pe cinci trasee: **Astăzi**, **Mișcări**, **Plan**, **Obligații** și **Analiză**, reproiectată ca Ledger Flow: situația curentă, instrumentul de lucru și decizia următoare au niveluri vizuale distincte. Utilitarele rare rămân în zona separată de instrumente, astfel încât bara telefonului servește activitatea zilnică. |
| Astăzi și bilanț | Bandă de marjă până la venit, următoarea decizie, măsurători de surse/obligații/plicuri și activitate recentă, toate calculate din registrul real. |
| Mișcări | Adăugare, editare și ștergere de venituri și cheltuieli într-un registru cronologic grupat pe zile, cu situația zilei și totaluri zilnice înaintea filtrelor. Căutarea locală găsește titlul, categoria, sursa, membrul, notița ori suma; intervalul, membrul, sursa, filtrele salvate și exportul CSV se deschid la cerere, într-o foaie secundară. Se pot salva maximum opt filtre locale, aplica, redenumi sau șterge; CSV-ul include numai rândurile vizibile și nu trimite date în exterior. |
| Captură rapidă și săptămână | Foaia „Înregistrare rapidă” salvează o mișcare reală cu suma, categoria, membrul și sursa. Când categoria și sursa corespund unui plic, acesta este ales automat și este afișată suma rămasă în tranșa activă; plata poate fi schimbată explicit în afara plicurilor. Combinațiile frecvente pot fi memorate, actualizate, arhivate pe lună, restaurate sau șterse definitiv ca șabloane numai pe telefonul curent; nu afectează tranzacțiile deja confirmate. Jurnalul arată recapitularea curentă luni–duminică, cu perspectivă Familie/Membru, venituri, cheltuieli, diferență și categorii principale. |
| Profil, membri și surse | Poate fi folosită de o singură persoană de la prima deschidere sau cu membri configurabili, carduri nominale, cash, bonuri de masă, transferuri și categorii precum Taxi. |
| Plan până la venit | Ecranul Plan pornește de la un singur ciclu salarial: suma disponibilă și începutul/sfârșitul sunt alese manual; un venit deja înregistrat poate doar precompleta suma și începutul. Fișa dominantă arată suma ciclului, rigla tranșelor, valoarea alocată, banii nealocați și pasul de decizie. Calculatorul împarte exact cele 28, 31 sau mai multe zile în tranșe de cel mult șapte zile, păstrând restul în ultima tranșă parțială. |
| Plicuri de categorie | O categorie precum Alimente, Transport/Taxi, Abonamente, Rate produse sau Consumabile copil are bugetul întregului ciclu, sursa reală, membrul opțional și un detaliu. De exemplu, Alimente 2.400 RON pe patru săptămâni pot fi create ca 1.200 RON cash Eu și 1.200 RON card Soție: fiecare plic are 300 RON în fiecare tranșă. O plată compatibilă selectează automat plicul și consumă exact tranșa activă; se poate alege expres un alt plic sau plata în afara plicurilor. |
| Puls, alerte și realocări | Fiecare plic are un prag de atenție configurabil de la 50% la 95%; depășirea este semnalată, nu blocată. Planul și formularul de mișcare arată suma rămasă atât în plicul ciclului, cât și în tranșa activă. Începutul unei tranșe poate genera o singură alertă locală pentru fiecare interval. Alertele nu trimit bani și nu cer acces bancar. Cifra de mâncare și scadențele programate sună și cu aplicația închisă, după ce telefonul le-a primit o dată. |
| Analiză, alerte și PDF | Comparație cu luna precedentă, evoluție lunară în anul curent, grafic interactiv de distribuție pe categorii, poziție financiară și plicuri la prag de atenție ori depășite. Bilanțul și planul calendaristic pot fi descărcate ca PDF local în browser; planul include suma, intervalul, ritmul și tranșele. |
| Gospodărie | Recapitulare de lună cu ritual de închidere local, vârstă a banilor, împărțire pe membri, vânător de abonamente din istoric și calendar de scadențe (inclusiv rate). |
| Încredere | Politică de confidențialitate, termeni și instrucțiuni de ștergere, publice pe GitHub Pages și în Setări. |
| Scadențe recurente | Chirie, abonamente, facturi, rate și contribuții pot rămâne pe confirmare manuală sau pot fi adăugate automat o singură dată la prima deschidere din ziua scadenței; ziua 31 se adaptează la ultima zi din lunile scurte. |
| Datorii și economii | Adăugare, editare, ștergere protejată, proprietar opțional (familie sau membru) și calcule de progres. O rată poate fi confirmată dintr-o sursă reală: creează cheltuiala în Jurnal, reduce automat soldul aceleiași datorii și păstrează istoricul „plată parțială” sau „achitată integral”. |
| Evenimente viitoare | Sărbătorile și aniversările pot fi notate cu data lor calendaristică și cu un cost estimat: Crăciun, Revelion, Paște, 8 Martie, 1 Iunie, începutul școlii și Vinerea Neagră au sugestii cu dată reală, iar Paștele ortodox este calculat pentru fiecare an. Aplicația arată cât trebuie pus deoparte pe săptămână și pe lună pentru fiecare eveniment și pentru toate la un loc. Sumele puse deoparte sunt note de planificare într-un jurnal local — nu pleacă din surse și nu intră în registru. Evenimentele anuale nu se rostogolesc singure peste banii strânși: ediția trecută rămâne la vedere până este închisă explicit. Apar și în calendarul lunar și în lista „Ce urmează” din Obligații. Asistentul le cunoaște: „pune-mi Crăciun 1200 pe 25 decembrie” sau „notează-mi Crăciun, cam 1200” creează evenimentul după confirmare, iar rezumatul trimis modelului online poartă ce urmează, cât e strâns și cât mai trebuie pus deoparte lunar. |
| Bonuri | Se scriu de mână: magazin, total, articole. Aplicația nu face și nu citește fotografii; pozele rămase din versiunile vechi se șterg de pe telefon la pornire. |
| Asistent de decizie | Răspunde la aceeași întrebare scrisă în mai multe feluri: „cât mai pot cheltui azi”, „cât îmi rămâne dacă plătesc chiria de 1500”, „de ce mi-a scăzut plicul de alimente”, „cât pe lună ca să am 3000 până în decembrie”. Poate propune împărțirea unei sume în plicuri, calculată din plicurile existente sau din cheltuielile ultimelor 90 de zile, cu scadențele scoase deoparte; poate mări, micșora sau șterge un plic, arătând rezultatul înainte de confirmare. O întrebare nu creează niciodată o înregistrare. Analiză locală explicabilă pentru cheltuieli, datorii, obiective, limite și alocări; include ritm zilnic, proiecție până la venit, întrebări rapide și calcule directe, de exemplu buget săptămânal împărțit pe zi. Se încarcă numai când este deschis. |
| Simulator conversațional | Interpretează local formulări precum „Dacă plătesc 120 lei pe taxi mâine”, previzualizează suma, categoria și momentul, apoi estimează marja până la venit fără să creeze sau modifice vreo mișcare. |
| Economisire explicabilă | Evidențiază ritmul, categoria dominantă, rezervele pentru scadențe și marja pentru obiective, exclusiv din registrul și planul curent. |
| Aspect și control | Selector persistent cu 3 teme: Alb, Întunecat și Navy, plus texturi de fundal. Include previzualizare mare, program local evaluat cât aplicația rămâne deschisă și contrast extra-ridicat. Fiecare temă schimbă fundalul, geometria suprafețelor, accentele și navigația, iar semnificația veniturilor, cheltuielilor și alertelor rămâne aceeași. Include monogramă B/F cu relief și favicon aferent, resetare controlată și export/import de rezervă. |
| Familie conectată | Pachet AES-GCM criptat local, sincronizat în timp real printr-un Firestore Firebase comun, fără cont sau token per utilizator — doar o parolă de familie identică pe fiecare telefon. Fiecare actualizare primită este reunită automat prin ID și marcaj de actualizare. |

> Aplicația începe fără date demo. Datele sunt locale până când alegi explicit exportul sau sincronizarea.

## Modelul de calcul v11

Aplicația păstrează un singur registru drept sursă de adevăr. Soldul afișat pentru o sursă de plată este **soldul inițial plus venituri minus cheltuieli** atribuite acelei surse. Planul include numai cheltuielile cu dată din intervalul ales; alocările personale sau pe categorii sunt consumate din aceleași intrări, nu dintr-un total separat. O scadență recurentă activă se rezervă separat în plan până când este confirmată; confirmarea creează o singură cheltuială legată, pentru a evita dubla numărare.

> Un **plic de categorie** nu mută bani într-un sold separat. El definește o limită verificabilă pe o categorie și, opțional, pe o sursă și un membru, de exemplu „Alimente, 1.200 RON, Card Soție”. La salvarea unei cheltuieli compatibile, aceeași intrare din registru scade soldul sursei reale și plicul selectat; când ciclul are o tranșă activă, arată și scăderea din acea tranșă. O persoană poate înregistra plata cu cardul altui membru, iar plicul este potrivit după sursa selectată.

> O **realocare** între plicuri modifică numai limitele interne ale celor două categorii. Ea nu creează o cheltuială, nu mișcă bani între card și cash și nu schimbă soldul unei surse. Pentru claritate, sunt permise doar între plicuri de categorii finanțate din aceeași sursă.

> **Prognoza nu schimbă bugetul.** Ea folosește cheltuielile deja înregistrate până azi, zilele rămase, limita planului și rezervele recurente pentru a arăta ritmul zilnic curent, ritmul sigur și suma proiectată până la următorul venit. Este o estimare explicabilă, nu o garanție și nu o recomandare de investiții.

> Când venitul intră de regulă într-o zi, dar poate veni mai devreme, se salvează atât data estimată, cât și **prima dată posibilă**. Planul, plicurile, scadențele rezervate și prognoza se opresc la prima dată posibilă pentru a nu considera bani care ar putea să nu fie încă disponibili.

> **Bilanțul nu dublează valorile.** Fluxul perioadei este venit minus cheltuieli înregistrate; ratele sunt obligații declarate, datoria rămasă este o valoare de pasiv, iar economiile sunt expuse separat. Poziția lichidă netă este soldurile utilizabile minus datoria rămasă.

> O **plată de rată** se confirmă manual cu suma, data, membrul și sursa de plată. Aplicația creează o cheltuială reală în categoria „Rate produse” și reduce soldul acelei datorii cu exact aceeași sumă; nu poate depăși soldul rămas și nu inițiază plăți bancare.

> Soldul inițial reprezintă punctul de pornire introdus de familie. În versiunea actuală nu este un extras bancar reconciliat pe o dată istorică; de aceea, utilizați-l ca bază de pornire la configurare și actualizați-l atent după importuri vechi.

> **Automatizarea recurentă rulează când aplicația este deschisă.** Pentru fiecare cheltuială activată, aplicația creează local o singură mișcare cu ID stabil pentru luna și data scadentă. Nu rulează în fundal când browserul sau aplicația este închisă și nu poate efectua plăți bancare.

## Performanță mobilă

Componentele de Plan, Analiză, scadențe, asistent și captura rapidă sunt încărcate la cerere. Generatorul PDF este încărcat numai după apăsarea exportului, nu la prima deschidere a aplicației. Runtime-ul React rămâne într-un fișier cacheabil; iconițele fiecărui ecran rămân în modulul acelui ecran, ca Astăzi să nu descarce iconițele Planului. După ce ecranul principal e gata, Planul și Mișcările sunt pregătite discret în fundal; instrumentele și temele se încarcă abia la deschidere. Kit-ul de componente nefolosit nu mai intră în CSS-ul inițial.


## Teme memorate

Butonul de paletă din antet deschide alegerea temei și păstrează opțiunea local pe dispozitiv. **Alb** e hârtie caldă; **Întunecat** e grafit pe OLED; **Navy** e albastru de noapte cu accent auriu. Textul, controalele și graficele sunt proiectate pentru contrast, iar coralul rămâne rezervat situațiilor de atenție.

## Familie conectată și sincronizare Firebase în timp real

Sincronizarea între telefoane nu mai cere niciun cont sau token per utilizator. Aplicația împarte un singur proiect Firebase (configurat o singură dată, de administrator, în `client/src/lib/firebase-config.ts`); fiecare familie primește propria „cameră" izolată în Firestore, dedusă printr-un hash SHA-256 al parolei ei — parola în sine nu este niciodată trimisă sau salvată. Registrul rămâne criptat AES-GCM în browser înainte de a ajunge în Firestore, la fel ca înainte.

**Configurare unică, de administratorul aplicației** (nu se repetă per utilizator sau per telefon):

| Pas | Acțiune |
|---|---|
| 1 | `console.firebase.google.com` → **Add project** (gratuit) → activează **Firestore Database**. |
| 2 | **Project settings** → **Your apps** → **Web (`</>`)** → **Register app**; copiază obiectul de configurare afișat. |
| 3 | Lipește valorile în `client/src/lib/firebase-config.ts` (`apiKey`, `authDomain`, `projectId` etc. — acestea nu sunt secrete, sunt publice prin design în orice aplicație Firebase). |
| 4 | În Firebase Console → **Firestore Database → Rules**, lipește conținutul din `firestore.rules` din acest repo. |
| 5 (opțional) | **App Check** — vezi secțiunea de mai jos. **Nu** activa Enforce până confirmi tokenul pe build-ul publicat. |

**Pentru orice familie care instalează aplicația**, odată ce administratorul a făcut configurarea de mai sus:

| Pas | Acțiune |
|---|---|
| 1 | Deschide **Mai mult → Sincronizare**. |
| 2 | Alegeți împreună o parolă de familie de cel puțin 12 caractere. |
| 3 | Introduceți exact aceeași parolă pe fiecare telefon și apăsați **Conectează acest telefon**. |

După conectare, modificările apar automat pe toate telefoanele conectate în câteva secunde, prin actualizări live Firestore — nu este nevoie de reîmprospătare manuală sau de interval de verificare. Unirea intrărilor se face prin ID și marcaj de actualizare, iar ștergerile — inclusiv scadențele recurente — sunt păstrate pentru a evita reapariția datelor eliminate. Fotografiile și cheile IndexedDB ale bonurilor, filtrele salvate, șabloanele active/arhivate, șabloanele de ciclu și marcajele alertelor de tranșă sunt excluse intenționat din pachetul sincronizat și rămân locale. Manualul pas cu pas este în **Mai mult → Ghid**.

## App Check (Firebase)

Checklist Enforce (fără a-l activa încă): [`docs/app-check-enforce-prep.md`](docs/app-check-enforce-prep.md) și `.env.example`.

Protecție anti-abuz a cotei Firestore. Sync-ul funcționează și **fără** App Check; cheia goală nu mai e tăcută — consola afișează un mesaj de setup.

1. Firebase Console → **Build → App Check** → aplicația web (și Android, dacă e înregistrată).
2. Provider **reCAPTCHA Enterprise** → creează / înregistrează site key-ul (classic / reCAPTCHA v3 e deprecated / blocked pe proiecte noi). În client: `ReCaptchaEnterpriseProvider` + același env `VITE_RECAPTCHA_SITE_KEY` (site key public, **nu** secret).
3. La build: `VITE_RECAPTCHA_SITE_KEY=... pnpm build` **sau** lipește site key-ul în `RECAPTCHA_SITE_KEY_PLACEHOLDER` din `client/src/lib/firebase-config.ts`.
4. Debug Capacitor: `VITE_APPCHECK_DEBUG=true` + debug token din App Check → Manage debug tokens (setează `self.FIREBASE_APPCHECK_DEBUG_TOKEN` înainte de init dacă e nevoie).
5. **Enforce pe Firestore: doar după** ce build-ul din Play / Pages trimite token. Până atunci, lasă Monitor — altfel blochezi familiile existente.

Checklist pe telefon: `PLAY_CHECKLIST.md`.

## Limite importante

| Cerință | Această versiune |
|---|---|
| CRUD financiar, planificare, temă și analize | Da, local în browser. |
| Copie între telefoane | Da, prin export/import sau prin sesiunea de sincronizare Firebase în timp real. |
| Sincronizare automată în timp real | Da, prin actualizări live Firestore cât aplicația rămâne deschisă pe cel puțin un telefon din sesiune; nu există serviciu de fundal cu aplicația închisă. |
| Modificări simultane ale aceluiași plan | Fiecare telefon reunește automat, prin ID și marcaj de actualizare, orice pachet primit de la celelalte. Pentru două editări simultane ale acelorași plicuri sau realocări, verifică Planul pe ambele telefoane. |
| Asistent LLM extern | Nu; GitHub Models a fost retras. Asistentul actual este local și explicabil. |
| Plata unei rate | Confirmare manuală în aplicație; actualizează registrul și soldul datoriei, păstrând suma, sursa, data și statutul parțial/integral în istoric; nu trimite bani și nu poate accesa banca. |
| Export PDF | Generat și descărcat local la cerere pentru bilanț sau planul calendaristic; datele nu sunt trimise unui serviciu extern. |

Datele financiare necriptate, bonurile și cheile nu trebuie comise în repo-ul public sau incluse în artefactele GitHub Pages. GitHub avertizează că Pages este public și nu trebuie utilizat pentru tranzacții sensibile.[^pages]

## Rulare locală

```bash
pnpm install
pnpm dev
pnpm check
pnpm build
pnpm test
```

Testele de regresie (`client/src/lib/*.test.ts`) verifică parserul românesc pentru sume, plata parțială și finală a unei rate, legătura ratei cu datoria și soldul rămas, filtrul de bilanț pe membru, migrarea defensivă a datelor vechi, șabloanele active, arhivate și de ciclu, filtrele locale salvate, exportul CSV sigur, snapshotul PDF de plan, recapitularea săptămânală Familie/Membru, plicurile pe surse și membri, inclusiv potrivirea plicului după cardul soției și calculul unei tranșe active, realocarea limitelor, regulile reversibile de repartizare a veniturilor, împărțirea calendaristică exactă pe 4 și 4½ săptămâni, identificarea tranșei active, pragurile configurabile de alertă, prima dată posibilă a venitului, scadențele recurente automate și ștergerea lor sincronizabilă, proiecția de ritm, interpretarea locală a unui scenariu natural, sugestiile explicabile, merge-ul defensiv dintre două copii familiale, cheile IndexedDB valide ale bonurilor, derivarea camerei de sincronizare Firebase dintr-o parolă de familie, stocarea locală IndexedDB și rezumatele de gospodărie.

## Android APK

Aplicația păstrează GitHub Pages pentru acces web și este pregătită separat pentru Android cu **Capacitor**. Pentru testare privată: în GitHub, deschide **Actions → Build Android APK → Run workflow**. După rularea verde, descarcă artefactul `Buget Familie` și instalează fișierul `Buget Familie.apk` pe un telefon Android. Pachetul debug e semnat cu o cheie efemeră generată la fiecare rulare — un build nou poate cere dezinstalarea celui vechi înainte de reinstalare, ceea ce șterge datele locale; exportă un backup înainte, din precauție.

| Comandă | Utilizare |
|---|---|
| `pnpm run cap:sync` | Construiește React/Vite și copiază bundle-ul în proiectul Android. |
| `pnpm run cap:android` | Sincronizează și deschide proiectul Android în Android Studio. |
| `cd android && ./gradlew assembleDebug` | Generează local un APK debug după instalarea Android SDK. |

Pachetul pentru Google Play (`ro.balty1991.bugetfamilie`, vezi `docs/play-store-listing-ro.md`) folosește un workflow separat, **Release Android AAB**, care semnează cu un keystore persistent păstrat în GitHub Secrets — vezi secțiunea „Release Play Store" mai jos. Nu introduce parole de sincronizare, tokenuri GitHub sau date financiare în setările de build.

## Release Play Store

Workflow-ul **Release Android AAB** (`.github/workflows/release-android-aab.yml`) construiește un `.aab` semnat, pregătit de încărcat în Play Console. Spre deosebire de build-ul debug, semnătura de release trebuie să rămână **identică** de la o versiune la alta — de-asta stă într-un keystore persistent, nu generat automat.

Configurare unică (nu se repetă la fiecare release):

| Pas | Acțiune |
|---|---|
| 1 | Local, generează un keystore propriu: `keytool -genkeypair -v -keystore release.keystore -alias buget-familie -keyalg RSA -keysize 2048 -validity 10000`. Alege parole puternice și **păstrează-le într-un manager de parole** — pierderea keystore-ului înseamnă că nu mai poți publica actualizări la aceeași aplicație pe Play Store. |
| 2 | Codifică fișierul: `base64 -w0 release.keystore` (macOS: `base64 -i release.keystore`). |
| 3 | În GitHub → repo → **Settings → Secrets and variables → Actions**, adaugă 4 secrete: `ANDROID_RELEASE_KEYSTORE_BASE64` (textul de la pasul 2), `ANDROID_RELEASE_KEYSTORE_PASSWORD`, `ANDROID_RELEASE_KEY_ALIAS` (`buget-familie`, dacă ai urmat pasul 1), `ANDROID_RELEASE_KEY_PASSWORD`. |
| 4 | Șterge `release.keystore` de pe calculator după ce l-ai încărcat ca secret, sau păstrează-l offline, într-un loc sigur — nu-l comite niciodată în repo. |

După configurare: **Actions → Release Android AAB → Run workflow**. Artefactul `buget-familie-release-aab` conține `app-release.aab`, gata de încărcat manual în Play Console (Producție sau testare internă). Înainte de fiecare release nou, crește `versionCode`/`versionName` din `android/app/build.gradle`.

Politică de confidențialitate: https://balty1991.github.io/buget-familie/privacy.html  
Termeni: https://balty1991.github.io/buget-familie/terms.html  
Ștergere date: https://balty1991.github.io/buget-familie/delete-data.html  
Listare Play (text gata de lipit): `docs/play-store-listing-ro.md`

[^pages]: [GitHub Docs — GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
