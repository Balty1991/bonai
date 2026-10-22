# Changelog

## 2.8.2 (245)

- **„Economisit cu BonAI” devine „Ai economisit la cumpărături”**: suma vine din reducerile tipărite pe bonuri și din prețurile mai mici ale magazinelor, nu de la aplicație. Pe Acasă: „Ai economisit · luna asta, din reduceri”; cardul spune acum, într-un rând, că reducerile sunt ale magazinelor și BonAI doar le adună din bonuri.

## 2.8.1 (244)

- **Scanarea pornește mai repede**: verificarea telefonului (identitatea anonimă și App Check) începe odată cu pregătirea pozei, nu după ea, iar cele două se așteaptă în paralel. Înainte se așteptau una după alta (până la 20 s pe web, mai ales în browsere cu blocare de urmărire, ca Brave). App Check, opțional pe server, are acum cel mult 3 s.
- **Fără „Pregătim bonul…”**: ecranul „Verifică bonul” se descarcă cât fotografiezi, nu după citire.
- **„Citit în X s”** pe „Verifică bonul”; când durează peste 15 s, un rând spune unde s-a dus timpul (poza, verificarea telefonului, serverul, internetul). Serverul trimite cât a lucrat el.

## 2.8.0 (243)

- **Prețurile din orașul tău, la vedere**: după al treilea bon, ecranul „Bon salvat” te întreabă o singură dată dacă vrei să afli unde sunt mai ieftine produsele tale. Spune exact ce se trimite (produsul, prețul, magazinul, orașul și luna, anonim) și ce nu (bonul, ziua, numele). „Nu acum” nu mai întreabă.
- **„Mai ieftin în oraș”**: pentru cine participă, ecranul „Bon salvat” arată până la 3 produse de pe bon pe care alții din oraș le-au plătit vizibil mai puțin în alt magazin (cel puțin 5% și 30 de bani pe unitate, din prețuri trimise de cel puțin 3 ori), lângă cât ai dat tu.

## 2.7.1 (242)

- **Cod vechi scos** (fără să atingă datele):
  - **„Mod copil”**, făcut pentru bugetul cu plicuri. Un telefon rămas în modul ăsta cere o singură dată codul adultului, apoi se deschide BonAI normal (fără cod salvat, iese direct). Modul nu se mai poate porni.
  - **„De verificat”**, importul de extras bancar, cu bulina lui. Ciornele rămase rămân salvate.
  - **Povestea anului** și cardurile ei de distribuire, rămase fără niciun loc de unde să fie deschise, împreună cu stilurile lor.
  - Fișiere moarte: vechile statistici, „ziua de salariu”, averea familiei.

## 2.7.0 (241)

- **Mai simplu pentru cine abia începe**: până la al treilea bon, Acasă arată doar „Scanează bonul” / „Notează suma”, cei trei pași („Fotografiezi bonul”, „Verifici și salvezi”, „Vezi unde se duc banii”) cu progresul („1 din 3 bonuri”) și bonurile. Cifrele lunii, scurtăturile, asistentul și rapoartele apar după al treilea bon, când au ce să arate.
- **Cont pe grupe**: Banii tăi (Bonuri, Toate cheltuielile, Rapoarte), Plăți și datorii (Calendarul plăților, Datorii, Abonamente, Facturi), Casa și familia (Familie, Garanții), Aplicația (Aspect, Export, Setări).
- **„Verifică bonul” mai aerisit**: fără bara colorată de categorii de sus (categoriile sunt chiar dedesubt); „Prețuri ca data trecută” e un simplu semn verde, iar cardul de prețuri apare doar când ceva chiar s-a scumpit sau ieftinit; sfatul „apasă pe produs ca să corectezi” stă deasupra produselor, nu la final.
- **Fiecare filă spune la ce folosește**, într-un rând: Lista de cumpărături („se bifează singur când scanezi bonul”), Ce ai în casă, Meniul săptămânii, Produse, Magazine. Fila „Stoc” se numește acum „În casă”.
- „În casă” nu mai arată garanția SGR sau sacoșa ca produse care se termină.
- **Denumiri mai clare**: „Scadențar” devine „Calendarul plăților”; Prețuri are filele Produse, Magazine, Rapoarte, iar verificarea codului de bare stă doar la Produse.

## 2.6.0 (240)

- **Prețurile față de data trecută, la verificarea bonului**: „1 mai scumpe (+0,36 lei) · 2 mai ieftine · 5 la fel · 3 noi”, comparat cu ultima dată când ai luat fiecare produs, în orice magazin. Pe rând apare ▲ sau ▼ cu diferența.
- **Gramajul pe fiecare rând** din bon („1 buc · 500 g”).
- **Mai multe liste de cumpărături**: „+ Listă nouă” (Weekend, Petrecere…), fiecare cu produsele ei; lista familiei rămâne principală. „Șterge lista” o golește. Bifarea din bon merge pe toate listele.
- **Rapoarte pe zi** („Zi”, lângă Săptămână, Lună, Trimestru, An), cu ziua de dinainte pentru comparație.
- **Cantitate în Rapoarte**: câte kilograme, litri și bucăți ai luat în perioadă, cu produsele cele mai multe în fiecare (din gramajul de pe bon sau din cântar).
- **Bonuri în altă monedă**: la detaliile bonului alegi EUR, USD, GBP, HUF, BGN sau MDL și cursul; sumele se salvează în lei, cu suma și cursul în nota cheltuielii.
- **Scanarea e din nou rapidă**: aplicația nu mai retrimite poza după 15 s (prima citire mergea mai departe pe server degeaba, iar a doua o lua de la zero, deci 18 s deveneau 35–40). Pe server, dacă Gemini nu răspunde în 9 s (13 s la două poze), pornește și Claude, iar primul bon citit câștigă; dacă Gemini cade, Claude pornește imediat. Se folosesc doar modele Gemini cu versiune, fără aliasurile „-latest” care se mutau singure pe un model mai lent.
- **Asistentul răspunde la întrebare, nu la rolul ales**: „Pe ce cheltui de obicei banii?” primea „unde poți economisi” pentru că era ales „Consultant economii”; acum rolul contează doar la o întrebare vagă. Răspunsuri noi: pe ce se duc banii (categorii, produse, magazin), plăți și rate care urmează, datorii rămase, garanții, sfaturi din obiceiurile tale, „azi” și „ieri”.
- **Câte scanări AI mai ai luna asta**, sub butoanele de pe Acasă, când abonamentele vor fi pornite.

## 2.5.0 (239)

- **Garanția pornește din bon**: pe ecranul „Bon salvat”, produsele cu garanție (electronice, electrocasnice, cele scumpe) apar cu „Adaug garanția” (2 ani, plus 14 zile de retur la magazinele online) sau „Nu are”. Bifa „Garanție adăugată” rămâne vizibilă; amintirea vine cu 30 de zile înainte să expire.
- **Lista se bifează singură din bon**: ce era pe lista de cumpărături și apare pe bonul scanat se bifează la salvare („Am bifat din listă: lapte, pâine…”), fără diacritice și fără cantități.
- **Widget nou „BonAI · luna asta”**: suma lunii, din câte bonuri, diferența față de luna trecută, următoarea plată și „Scanează”. Ascuns cu PIN pe aplicație sau pe telefonul unui copil.
- **Widgeturile bugetului vechi au fost scoase** („Poți cheltui azi”, „Plicurile mele”, „Săptămâna banilor”), cu datele lor de pe telefon. Rămân widgetul rapid și lista de cumpărături. Cine avea unul dintre cele vechi pe ecran îl înlocuiește cu „BonAI · luna asta”.

## 2.4.2 (238)

- **Bonul scanat de două ori**: la „Verifică bonul” apare cardul „Ai mai înregistrat bonul ăsta”, cu data, ora, magazinul și suma bonului salvat, și butoanele „Nu-l salva” / „E alt bon”. Se recunoaște după magazin, zi și total (cu ora, dacă o au amândouă) și, când totalul a fost citit altfel, după produse (aceleași în proporție de peste 80%). Se verifică din nou când schimbi data, ora sau totalul. „Salvează bonul” mai întreabă o dată înainte să-l pună de două ori.

## 2.4.1 (237)

- **Produsele ambalate au prețul pe bucată** în „Produsele tale” și în Rapoarte (de exemplu Actimel 4 × 100 g: prețul bucății, nu „42,45 lei/kg”). Prețul pe kg sau litru rămâne dedesubt, mai mic, pentru comparat gramajele; produsele de la cântar rămân pe kg.

## 2.4.0 (236)

- **Acasă e acum un tablou de bord**: totalul lunii cu diferența față de luna trecută și, alături, „Scanează bonul” și „Notează suma”; patru cifre dintr-o privire (de plătit în 30 de zile, datorii rămase, inflația ta, cât poți economisi), fiecare cu un tap spre locul lui; scurtături spre Rapoarte, Scadențar, Datorii și Garanții; „Unde se duc banii” cu Categorii / Produse într-un singur card.
- **Asistentul tău are secțiunea lui**: pe Acasă rămâne un singur rând cu cea mai importantă observație; toate se deschid când vrei.
- **Un singur ecran de pornire**: aceeași iconiță, la aceeași mărime, pe fundal negru, de la pornirea telefonului până apare aplicația (fără al doilea logo).
- **Textele stau ordonat în toată aplicația**: cuvintele nu se mai rup la mijloc („Scanea-ză”) și „lei” nu mai sare pe rândul următor, despărțit de sumă; pe Acasă titlurile sunt scurte, cu „Toate” aliniat în dreapta, iar categoriile au numele și suma pe un rând, cu bara dedesubt. Testul automat al ecranelor verifică asta pe fiecare ecran.
- **Schimbarea între file e fluidă**: fiecare filă e pregătită dinainte, trecerea nu mai arată „Pregătim…” și nu mai clipește.

## 2.3.1 (235)

- **Codul vechi de notificări al bugetului cu plicuri a fost scos din aplicație.** Nu mai există „Plic epuizat”, „Ritm peste plan”, „Azi la mâncare”, ritmul săptămânii, tranșe, salariu, obiective, amintirea de seară sau bilanțuri. Rămân doar notificările BonAI: abonamente și facturi (cu amintirea aleasă), rate, dobânzi și comisioane din Datorii (cu 3 zile înainte și în ziua plății, dacă nu sunt bifate), copia de siguranță, garanții, „Unde e mai ieftin” și cheltuielile noi din familie.
- Ratele se iau acum din Datoriile BonAI, cu bifa de plată: o rată bifată nu mai trimite aviz.
- Setări → Notificări: doar cele patru feluri BonAI.
- Lista de alerte salvată pe telefon de versiunea veche (pe care Android o repunea după repornire sau actualizare) se curăță la prima pornire: partea nativă păstrează doar alertele BonAI.

## 2.3.0 (234)

- **Scadențar** (Cont → Scadențar, Datorii, Acasă → „Ce urmează”): calendarul lunii cu fiecare plată în ziua ei (rate, credite, dobânzi și comisioane, abonamente, facturi), inelul „plătit din total”, totalul pe săptămâni și ziua cea mai încărcată.
- **Planul de ieșire din datorii** (Datorii): luna în care termini, graficul restului pe luni, cât mai dai în total și cât e dobândă, câștigul dacă muți rata unei datorii stinse la următoarea și dacă dai +100/+200/+500 pe lună. Dobânda: cea scrisă de tine sau estimată din rest, rată și ultima rată, doar la creditele bancare lungi (ratele fără dobândă de la magazine rămân fără dobândă); „Folosește estimarea” o trece în datorie.
- **Dobânzi și comisioane bancare**: tip nou „Comision bancar (card, cont)”, overdraftul și comisioanele separat în Datorii, cu totalul pe an, și grup separat în Rapoarte; „Comision / dobândă bancă” la notarea fără bon.
- **Asistentul tău** (Acasă și Rapoarte): observații calculate pe telefon, fără să plece nimic: ziua în care cheltui cel mai mult, cumpărăturile mici și dese, categoria care crește, cât din bani merg pe plăți fixe, cât te costă banca, cum termini datoriile mai repede, ziua cu multe plăți.
- **Tema Noapte, Negru OLED**: fundal negru complet, fără strălucire în spate, text alb și margini clare, pentru o afișare mai tăioasă (și mai puțină baterie pe ecranele OLED).
- **Rapoarte**: inel animat pe categorii.
- **Bonul scanat se corectează mai ușor**: data, ora, orașul și totalul tipărit se schimbă chiar la scanare (apeși pe dată); un rând de ajutor arată că produsele se corectează apăsând pe ele.
- **Notificările bugetului vechi s-au oprit**: „Azi la mâncare”, plicuri aproape de limită, ritmul săptămânii, salariul, obiectivele, amintirea de seară și bilanțurile nu se mai programează (cele deja puse se anulează la prima deschidere). Rămân scadențele (abonamente, facturi, rate, dobânzi), copia de siguranță, garanțiile și „Unde e mai ieftin”; amintirile de abonamente țin acum de bifa „Abonamente, facturi și rate”.
- Ratele plătite înainte de bifă (notate cu plata) apar ca plătite luna asta, ca să nu fie bifate de două ori; datoriile vechi de la eMAG se deschid la editare ca „Rată card de cumpărături”, nu ca dobândă.

## 2.2.1 (233)

- Telefoanele cu Android WebView mai vechi (sub Chrome 98): Setările nu mai dau eroare („structuredClone is not defined”), iar copia de siguranță dinaintea trecerii la BonAI se face și acolo.

## 2.2.0 (232)

- **Coșul tău la fiecare magazin** (Magazine, și pe Acasă când diferența trece de 5 lei): produsele pe care le iei des, în cantitatea ta obișnuită, puse la prețul fiecărui magazin; cel mai ieftin sus, cât ai da în plus în rest, „Spune-le prietenilor”.
- **Promoțiile nu mai strică comparația:** magazinele se compară la prețul obișnuit (fără reducerea de pe bon, mijlocul ultimelor 3 cumpărări), și în „Unde poți economisi”, în notificare și în prețurile trimise comunității.
- **Prețurile din orașul tău** (opțional, oprit implicit): „Particip” trimite anonim produsul, prețul pe unitate, magazinul, orașul și luna; primești prețurile celorlalți, ca să vezi și magazinele unde n-ai fost. Pe server doar medii, arătate după cel puțin 3 trimiteri, șterse după 100 de zile. Politica de confidențialitate are secțiunea 4b.
- **Notificare „Unde e mai ieftin”**: sâmbătă la 10:00, produsul tău cu cea mai mare diferență de preț între magazine (se oprește din Setări → Notificări).
- **Recomandă BonAI** în Cont: mesaj gata de trimis pe WhatsApp, cu economia ta reală dacă există.

## 2.1.5 (231)

- Ratele, creditele, abonamentele și facturile rămân în aplicație, separat de cumpărături: în Cont (Abonamente, Facturi, Datorii), pe Acasă în „Ce urmează” și în Rapoarte la „Plăți fixe”. Totalul lunii arată în continuare doar cumpărăturile.
- **Fără bon? Notează suma** are o secțiune „Plăți fixe”: Rată la bancă, Rată produs, Abonament, Factură și ultimele plăți fixe dintr-o atingere (ex. „Raiffeisen Alin · 672,96”). Nu intră la cumpărături.
- **Datorii, ca în Buget Familie:** „Marchează rata plătită” scade restul și notează plata la plăți fixe (apare în Rapoarte și în Toate costurile, nu la cumpărături); „Anulează bifa” pune totul la loc; la fiecare datorie: câte rate mai sunt, luna ultimei rate și cât ai plătit până acum; sus: „luna asta: X din Y bifate, mai ai Z lei”.
- Rapoarte: rata la magazin și plata în rate merg la „Rate la produse”, creditul bancar și împrumutul la „Împrumuturi și credite”.
- (2.1.4 le scotea de tot; se renunță la asta.)

## 2.1.3 (229)

- **Rapoarte** (Prețuri → Rapoarte, Acasă → „Raportul complet”, Cont → Rapoarte): săptămână, lună, trimestru și an, cu navigare înapoi și comparație cu perioada dinainte; cumpărăturile pe zile, categorii, produse și magazine; plățile fixe separat (rate la produse, împrumuturi și credite, abonamente, facturi și taxe); total cheltuit; „Trimite raportul”.
- **Cumpărăturile lunii** nu mai adună transferurile între cardurile familiei, corecțiile de sold, ratele, facturile și abonamentele (octombrie: 2.808 lei în loc de 6.240).
- **Raza de scanare** merge iar lent, ca pe telefon: pe Android, tăierea animațiilor o făcea să sară.
- **Bara de jos** e opacă; **Notează fără bon** are iconițe la toate categoriile și nu mai propune Transfer, Rate sau Corecție de sold.
- Contrast mai bun pe Prețuri (prețul cel mai mic, numărul de cumpărări).

## 2.1.0 (226) — BonAI pentru Google Play

- Scanare AI mai rapidă (3–5 s pe server), scanare offline gratuită și nelimitată, bon digital animat la citire.
- Cod de bare în magazin (Open Food/Pet Food/Products/Beauty Facts + Wikidata), fișă de produs cu ultimul preț.
- Editare și ștergere bonuri, cheltuieli fără bon, „Economisit cu BonAI”, lista cu prețuri, „Ți se termină”, verificarea reducerilor, „Ce urmează”, modul exemplu.
- Temă de noapte mai clară. Politica de confidențialitate, termenii și pagina de ștergere rebrănduite BonAI.
- Plățile rămân oprite (`BILLING_LIVE = false`, `AI_QUOTA_ENFORCED = false`).

## 2.0.3 — BonAI, design nou

- Icon nou (vizor de sticlă, bon, rază neon), sigla BonAI în antet, splash și iconuri Android/web refăcute din SVG.
- Design nou: Noapte (navy/violet) și Luminos (alb-lavandă), carduri de sticlă, accent violet → cyan, fonturi Space Grotesk + Inter incluse; Temă: Luminos / Noapte / Automat (implicit Automat).
- Animație de citire a bonului (pur vizuală, fără produse inventate; respectă „mișcare redusă”).
- Ecran nou de verificare a bonului: produse pe categorii cu subtotal, reduceri, verificarea totalului, editare pe loc, „cine a cumpărat”, rezumat după salvare. Fără surse, plicuri sau venituri; datele se salvează în aceeași formă (sync compatibil).
- „Notează de mână” în BonAI deschide același ecran de bon, gol.

## 2.0.2 — BonAI

- Numele aplicației devine **BonAI** (fost Bonuț în 2.0.0–2.0.1): titlu, launcher, widget, pagina listei partajate, texte.
- Identificatorii interni (appId, SKU-urile bonut_pro / bonut_familie, numele fișierelor) rămân neschimbați; datele nu se ating.

## 2.0.0 — BonAI

Aplicația devine **BonAI**, lista de cumpărături care îți arată cât economisești (docs/ARHITECTURA.md).

- Nume, icon (bonul zimțat cu bifă) și culori noi; bara de jos: Acasă · Cumpărături · Scanează · Prețuri · Gospodărie.
- Lista familiei gratuită, trimisă pe WhatsApp ca link web pe care îl bifează și cine nu are aplicația (l.html).
- Stocul casei din bonuri și Meniul săptămânii (cost doar din prețurile tale).
- Codul de bare în magazin (ML Kit): cât ai dat ultima dată și unde a fost mai ieftin.
- Acasă: media pe 3 luni, „Economisit cu BonAI” (reducerile de pe bonuri), distribuire.
- Planurile Gratuit / Pro / Familie și paywall-ul în context (plata încă oprită: totul deschis).
- Widget Android cu lista și scanarea dintr-o atingere.
- Bugetul vechi devine Arhiva veche, doar citire, exportabilă; migrarea la schema 2 face înainte o copie completă pe telefon. Nicio dată nu se șterge.
- Corpus de bonuri cu prag de acuratețe în CI.

## 1.1.220

- **O aplicație nouă: cumpărăturile familiei, pornind de la bon.** Meniu nou: Acasă · Produse · Scanează · Magazine · Casa, cu altă înfățișare (alb cald, negru și portocaliu, alt font).
- **Acasă:** cât ați dat luna asta pe bonuri față de luna trecută, butonul mare „Scanează bonul”, unde puteați economisi (același produs, mai ieftin la alt magazin), inflația ta, garanțiile care expiră, produsele pe care se duc banii, categoriile și bonurile recente.
- **Magazine:** cât lăsați la fiecare magazin, de câte ori mergeți, coșul mediu și cât de scump e față de cel mai ieftin, la produsele luate din mai multe locuri.
- **Casa:** familia și sincronizarea, garanțiile, lista de cumpărături, bonurile, toate cheltuielile, exportul și setările.
- **Bugetul cu plicuri rămâne întreg,** cu toate datele: Casa → „Buget (vechi)”. De acolo, Mai mult → „Aplicația nouă” te aduce înapoi.

- **Garanții și retururi** (Mai mult → Cumpărături și bonuri): aplicația propune din bonuri produsele care au garanție (electronice, electrocasnice, orice rând nealimentar de peste 300 lei din ultimii doi ani) și le adaugi dintr-o atingere, cu 2 ani garanție legală; sau le treci de mână.
- **Ultima zi de retur:** 14 zile implicit la magazinele online (eMAG, Amazon, Fashion Days…), alegi 0, 14 sau 30. Notificare seara dinainte și dimineața ultimei zile.
- **Garanția care expiră:** notificare cu 30 de zile înainte, ca să duci produsul la service cât e încă în garanție.
- **Poza bonului**, micșorată, păstrată pe telefon: hârtia termică se șterge în câteva luni.
- Garanțiile se sincronizează cu celălalt telefon; notificările lor se pot opri din Setări → Mementouri.

## 1.1.219

- **Bonul citit pe produs, nu doar pe categorie.** La scanare, fiecare articol vine acum cu marca („Zuzu”, „Dorna”), gramajul sau volumul („1 l”, „500 g”), cum se vinde (bucată, kg, litru), prețul pe bucată sau pe kg tipărit și cota TVA; iar din antet: codul fiscal, adresa, orașul și ora bonului. Instrucțiunile modelului au exemple de rânduri de la Lidl, Kaufland, Carrefour, Mega Image, Profi, Auchan și Penny.
- **Prețul pe kg sau pe litru**, sub fiecare articol la „Corectează” („Dorna · 2 l · 4,25 lei/l”): baza pentru istoricul de preț pe produs și pentru „inflația ta” din versiunile următoare.
- Datele noi rămân după corectură, repornire și sincronizarea cu celălalt telefon; bonurile vechi și cele scrise de mână merg ca înainte.
- **„Produsele tale”** (Mai mult, lângă Bonuri): fiecare produs cumpărat, cu prețul pe kg/l/bucată, graficul în timp, variația pe 1, 3 și 6 luni și magazinul unde a fost cel mai ieftin; căutare după nume.
- **Inflația ta:** cât s-au scumpit produsele pe care chiar le cumperi (luna asta față de cele trei dinainte), ponderat după cât dai pe ele; ce s-a scumpit cel mai mult și categoriile în care dai mai mult ca de obicei.
- **Shrinkflation:** alertă când același produs vine cu gramaj mai mic la același preț sau mai mare („1 l → 0,9 l: +14% pe litru”).

## 1.1.218

- **„Modifică plicul” nu mai refuză salvarea cu „Pe Card bonuri sunt liberi doar 0 RON”.** Tichetele deja cheltuite din plic (la Lidl, Mega) au soldul 0, dar partea lor din plic e acoperită; acum contează ca atare.
- **Editarea păstrează ce a setat „Plicuri mai simple” și „Reglează săptămânile”:** „din orice card”, categoriile adăugate (dulciuri, băuturi, apă…) și suma pe săptămână nu se mai pierd la „Salvează plicul”.
- La un plic „din orice card”, formularul spune că sursa arată doar din ce bani se pune deoparte suma.

## 1.1.217

- **„Am lipsit câteva zile”:** după 3 zile fără nicio cheltuială notată, Astăzi întreabă singur cât arată banca pe fiecare card. La o diferență alegi ce înseamnă: **„Am cheltuit fără să notez”** (intră ca „Cumpărături nenotate” în plicul de cumpărături și în analiză), **„Soldul de pornire era greșit”** (se îndreaptă soldul de pornire, fără nicio mișcare în registru) sau „Doar corectez soldul”.
- **Sursele goale nu mai încarcă lista „Plătit din”:** cardurile fără nicio mișcare și cu sold 0 (de ex. un Revolut nefolosit) nu mai apar; cel ales rămâne mereu.
- **Obligații → „Se eliberează”:** ratele care se termină în cel mult 3 luni și cât rămâne liber pe lună după ele, ca suma să primească un loc.
- **Overdraftul folosit**, lângă dobânda „lunar, fără dată de final”: cardul aceleiași persoane care e pe minus și cu cât.
- **Obligații: Obiective / Calendar / Evenimente stau acum chiar pe un rând** (o regulă veche le întindea pe toată lățimea, unul sub altul).
- **Notificarea din ziua salariului** spune deja sumele de luna trecută (salarii, tichete, alocație); „A intrat salariul” e doar o verificare și o atingere.

## 1.1.216

- **Plicuri mai simple, dintr-o atingere** (în Plicuri). Alimente devine **Cumpărături** (alimente, dulciuri, băuturi, apă, SGR, sacoșe), apar **Copil** (consumabile copil, pe lună) și **Altele** (haine, farmacie, timp liber, pe lună), cu sumele alese de tine; Taxi rămâne.
- **Plicurile iau plata din orice card, al oricui**, cu bonuri sau cash: cheltuiala intră singură în plicul ei, fără „din plic sau din nerepartizat”. Plicul arată doar cât mai ai; cardul arată unde sunt banii.
- Înainte să aplici vezi cât ai cheltuit deja în ciclul ăsta pe Copil și pe Altele (intră în plic).
- **Bonurile pe tipul lor:** „Card de bunuri” devine card de tichete, „Voucher SGR” devine voucher; tichetele nu mai apar ca bani liberi.

## 1.1.215

- **Plicuri: „Reglează săptămânile”** (în „Toate săptămânile”). Spui cât mai ai săptămâna asta, de azi până duminică, și cât vrei pe săptămână de acum încolo (ex. 400, apoi 600). Plicul se reface singur: săptămânile trecute rămân cu cât s-a cheltuit, cea scurtă de dinaintea salariului primește partea zilelor ei, iar diferența se ia din nerepartizat (din card, nu din bonuri) sau se eliberează. Vezi suma nouă înainte să aplici.

## 1.1.214

- **Facturile notate devin plăți lunare dintr-o atingere.** În Obligații, „Să nu le mai scrii în fiecare lună” arată facturile scrise de mână în ultimele 45 de zile (lumină, apă, telefon, grădiniță, abonamente) și le face lunare cu un buton: se pun deoparte din salariu și apar la „de plătit”. Plata deja notată luna asta se leagă de ele, deci nu apar a doua oară (raport real, 14 oct: 7 facturi scrise una câte una).
  - Utilitățile (lumină, apă, gaz, întreținere) sunt „sumă aproximativă”: le confirmi cu suma de pe factură. Butonul se poate schimba pe „sumă fixă”.
  - La Scadențe, pe o plată aproximativă: „Doar actualizez suma (plătesc mai târziu)”, când factura a venit dar n-ai plătit-o încă.
- **Dobânda de overdraft rămâne la Datorii, urmărită, dar „lunar, fără dată de final”**: plata lunară (aproximativă) se confirmă cu suma reală și nu scade soldul; dispar „scapi de ea în…”, graficul de rate și locul din ordinea de plată.
- **Notează: ziua se alege direct** (Azi, Ieri, Alaltăieri sau Altă zi), fără „Cine, sursă, categorie”. **„Ce ai cumpărat” nu mai deschide lista automat**: scrii liber, iar produsele din bonuri apar ca sugestii mici abia după 2 litere.
- **Două facturi într-o lună** (la lumină se întâmplă): la Scadențe, pe o plată aproximativă deja plătită luna asta, „+ Încă o factură luna asta” o notează pe aceeași plată lunară, fără să fie luată drept dublură.
- **Obligații:** Obiective, Calendar și Evenimente stau pe un rând, trei butoane egale, cu iconița deasupra.

## 1.1.213

- **Reducerea pe tot bonul se împarte pe articole.** La Pepco, „Reducere pentru angajați 25%” / „DISCOUNT 23,23” stă sub SUBTOTAL, nu sub un produs; cititorul de bonuri o lăsa pe dinafară și rândurile dădeau 92,90 lei, cu 23,23 peste totalul de 69,67 (raport real, 14 oct). Acum:
  - cititorul de bonuri împarte reducerea pe toate articolele, proporțional, ca rândurile să dea totalul;
  - pe telefon, dacă tot rămâne o diferență care e un procent rotund din bon (5%, 10%, … 50%), o împărțim noi, iar „Reduceri” o arată. O diferență fără procent rotund rămâne de verificat, fiindcă e mai probabil un rând citit greșit.
  - **Produs gratuit** (Lidl, 14 oct: „Reducere Lidl Plus / DISCOUNT 25,99” sub un Prosecco de 25,99): când diferența e exact un rând, sau reducerea citită a unui rând nescăzută din preț, acel rând ajunge la 0 și reducerea apare la „Reduceri”.

## 1.1.212

- **Rata confirmată nu mai rămâne „Întârziată”.** În Obligații (și în scadențele de pe Astăzi) rata se arăta după data ei fixă din lună, fără să se uite la plăți: după „Confirmă plata”, banii ieșeau corect din card, dar rata rămânea în listă ca întârziată (raport real, 14 oct: Emag fier de călcat, 90,25). Acum, după plată, rata trece pe scadența de luna viitoare; o plată acoperă o singură lună.
- **Titlul plății e clar.** „Rată plată parțială — …” suna ca o rată plătită pe jumătate; însemna doar că datoria nu e încă stinsă. Acum: „Rată — Emag (fier călcat)”, iar nota spune cât mai rămâne din datorie; la ultima: „Rată achitată integral”.

## 1.1.211

- **Analiza într-un singur loc.** În Mai mult, analiza era împărțită în cinci intrări (Raportul lunii, Grafice, Tendințe, Calendarul banilor, Planul pe 12 luni), pe lângă Analiză. Acum e o singură intrare, „Analiză”, iar cele cinci se deschid din ea, dintr-un rând de butoane de sub file; „Înapoi” te duce tot în Analiză. Nimic nu s-a șters (raportul de testare din 13 oct).
- **Mai mult, mai scurt.** „Instrumente avansate” păstrează doar investițiile, averea, ieșirea din datorii, prețurile și regulile.
- **Subsolul din Mai mult stă la locul lui**, fără marginea negativă care îl trăgea sub bara de jos.
- **Stiluri:** scoase ultimele reguli pentru o pictogramă de bon care nu mai există.

## 1.1.210

- **Permisiunea și programarea notificărilor nu se mai agață pe Android.** Pluginul de notificări era întors direct dintr-o promisiune, iar telefonul îl lua drept promisiune: citirea permisiunii și programarea prin pluginul Capacitor nu se terminau niciodată și raportau „LocalNotifications.then() is not implemented on android” (Sentry #89). Acum pluginul e întors într-o cutie, ca celelalte pluginuri native.

## 1.1.209

- **„Din nerepartizat” rămâne în afara plicului și la un bon scanat.** Bonul scanat deschide formularul cu o ciornă gata completată; la salvare, alegerea „Din nerepartizat” nu se mai ținea minte, iar cheltuiala ajungea singură în plicul Alimente și scădea din limita săptămânii (raport real, 11 oct: Mega Image 23,16 pe bonuri). Acum alegerea făcută în formular se păstrează.

## 1.1.208

- **Analiză pe articole.** Un bon cu detergent, mâncare și bere intra în „Unde au mers banii” cu totul la o singură categorie (bonul Mega de 165,51 tot la „Casă & facturi”). Acum fiecare articol de pe bon merge la categoria lui: Băuturi, Apă, Dulciuri, Alimente. Un bon plătit din două surse nu se numără de două ori; unul deja împărțit pe categorii nu se mai desface (raport real, 10 oct).
- **„Pe ce ai dat cel mai mult” și „Unde”.** Atingi o categorie în Analiză și vezi primele 5 articole (cu de câte ori le-ai luat) și magazinele.
- **„Plătit din” / „Încasat în”, ușor de citit.** În locul listei de sistem: o foaie cu sursele grupate pe persoană, numele mare, felul sursei (card, numerar, tichete) și soldul aliniat în dreapta; sursele goale sunt estompate.

## 1.1.207

- **Plicul din două surse arată cât mai e din fiecare.** Un plic de Alimente de 2.744 făcut din 2.144 pe card și 600 pe bonuri arăta „+ tichete: 708” (tot soldul cardului de bonuri), deși bonurile erau deja în plic. Acum, sub sumă, apare partea fiecărei surse: „Card bonuri Alin: 434 din 600”, „Card Raiffeisen Alin: 2.144 din 2.144” (raport real, 10 oct).
  - La notare, când alegi sursa, apare „Din partea Card bonuri a plicului rămân …”; dacă nu ajunge, spune cât e peste și că restul se plătește din cealaltă sursă a plicului.
  - Chenarul „Se va lua din plic” arată sursa aleasă, nu pe cea principală a plicului.
  - „+ tichete” rămâne doar pe plicurile de mâncare care nu au bonurile incluse, cu textul „în afara plicului”.

## 1.1.206

- **Rapoarte de erori (Sentry), fără date personale.** Când aplicația dă o eroare, aflăm singuri ce s-a întâmplat, fără capturi de ecran trimise de mână. Pleacă doar tipul erorii, locul din cod, versiunea și dacă e Android sau browser. Din mesaj se scot cifrele și textul dintre ghilimele; pașii dinaintea erorii, adresa IP, sumele, numele, magazinele și bonurile nu pleacă. Datele stau în UE (Frankfurt).
  - Se opresc din Setări → Mementouri și siguranță → „Trimite rapoarte de erori”.
  - Biblioteca se încarcă după pornire (30 KB), deci aplicația nu pornește mai greu.
  - Politica de confidențialitate și răspunsurile Data safety descriu noul furnizor.

## 1.1.205

- **În browser nu mai vibrează la fiecare schimbare de ecran.** Vibrația fină a sistemului există doar în aplicația instalată. În browser pornea motorul de vibrație la fiecare atingere care deschidea un ecran (raport real, 9 oct). Acum, în browser, vibrează doar salvarea unei notări și ștergerea. În aplicație nu se schimbă nimic.

## 1.1.204

- **„Închide săptămâna”.** Luni (sau duminică seara), pe Astăzi apare „Închide săptămâna”. Un ecran scurt arată cât ai cheltuit din plicurile săptămânii și ce a rămas:
  - restul trece în săptămâna următoare (bifat din start, se poate debifa);
  - o depășire se acoperă din săptămâna următoare, ca să nu rămână neagră pe Plan;
  - la „Soldul, ca în bancă” scrii cât vezi în aplicația băncii sau în portofel, iar dacă diferă, aplicația potrivește soldul cu o corecție.
  
  Plicul rămâne același: se mută doar bani între săptămâni. Duminică dimineața nu se propune, ca Astăzi să nu ajungă la 0 în ultima zi a săptămânii. Cu „Ce rămâne trece în următoarea” pornit în Plan, nu mai întreabă.

- **Etichete: „Pentru” Serviciu, Casă, Copil, Mașină sau una nouă.** La Notează și la corectarea unei mișcări, sub categorie apare rândul „Pentru (opțional)”. Categoria spune ce ai cumpărat, iar eticheta spune unde sau pentru cine: un sandviș la birou rămâne Alimente, dar cu eticheta Serviciu. Aceeași denumire primește singură eticheta de data trecută („Shaorma birou” → Serviciu). În Analiză, „Pe etichete” arată cât ai cheltuit pe fiecare de la salariu încoace, cu categoriile dinăuntru și comparat cu aceleași zile de dinainte.

- **„De unde vine cifra?”** Sub cifra mare de pe Astăzi, butonul deschide calculul. Mai întâi cum se ajunge la cifra zilei, apoi socoteala lunii ca pe un bon: pe carduri și cash − rămas în plicuri − rate și facturi până la salariu = liberi. Sunt aceleași cifre ca sus în Plicuri, ca un număr greșit să se vadă pe ce rând e.
- **Bonul scanat se împarte singur.** Pus în plicul de alimente pe săptămâni, bonul cu articole întinde singur pe lună ce nu e mâncare: hârtie igienică, detergent, hrana pisicii. Nu mai trebuie bifat. Bonul Mega Image cu detergentul ca articol cel mai scump nu mai iese „în afara plicurilor”: merge în Alimente, iar 134,58 lei se împart pe săptămâni. Bonul primește și eticheta de data trecută.

## 1.1.203

- **„A intrat salariul”, într-un singur pas.** În ziua salariului, pe Astăzi apare „A intrat salariul”, iar în Plicuri „A intrat salariul: pornește luna”. Un singur ecran care propune:
  - veniturile de luna trecută (salariul, tichetele, alocația), cu sumele de schimbat sau debifat; ce e deja notat azi nu se mai adaugă o dată;
  - luna nouă, până la salariul următor;
  - plicurile pe noua perioadă: Alimente rămâne la 600 pe săptămână, iar totalul se reface din zilele lunii;
  - ratele până la salariu, cu ale lui Angi separat;
  - socoteala de la final: pe carduri și cash − în plicuri − rate = nerepartizat, aceeași cifră ca în Plan după apăsare.
  
  „Pornește luna” face totul o dată. Mișcările vechi rămân neatinse, iar luna trecută intră în istoric.
- **Verificări automate ale banilor.** O lună întreagă simulată zi cu zi, pe cinci variante, trebuie să respecte de fiecare dată regulile: Astăzi arată exact partea de azi a plicului cât banii sunt în surse, săptămânile dau plicul, soldurile se potrivesc cu mișcările, nicio rată nu se scade de două ori. Erorile ca „0,00 după cumpărăturile mari” se prind înainte de versiune.

## 1.1.202

- **Astăzi nu mai arată 0,00 după cumpărăturile mari.** Cu plic săptămânal, cifra zilei se lua din „banii din cont împărțiți pe zilele până la salariu, minus tot ce s-a cheltuit azi”. Un bon de 165 de lei depășea partea unei singure zile, iar Astăzi arăta 0,00, deși plicul săptămânii mai avea bani pentru azi (raport real, 9 oct). Acum cifra zilei vine din plicul săptămânii (42,21 lei, din 213,71 pentru 3 zile), iar banii din cont rămân doar plafonul total.
- **Felia „pentru toată luna” e pe măsura săptămânii.** O săptămână întreagă ia mai mult, iar ultima zi dinaintea salariului aproape nimic: S6 nu mai scade de la 86 la 63. Feliile se rotunjesc la bani, iar ultima ia restul, ca suma să dea fix partea bonului.

## 1.1.201

- **Bifa „pentru toată luna” găsește singură ce nu e mâncare.** Pe un bon cu articole (scanat sau scris), bifa completează suma a tot ce nu e mâncare sau băutură și arată ce a pus: hârtie igienică, gel de duș, săpun lichid, odorizant, detergent, hăinuțe, jucării, hrana animalelor. Mâncarea, fructele, dulciurile, apa, băuturile (și alcoolul), SGR-ul și sacoșa rămân pe săptămâna cumpărăturilor. Recunoaște și prescurtările de pe bonuri („H.IG.CELULOZA … 10ROLE”, „REZ.SAP.LICHID”), plus hrana pisicii trecută din greșeală la Alimente. Pe bonurile din 9 octombrie: Mega Image, 134,58 din 165,50; Familia RO, 18,16 din 106,20. Suma se poate schimba înainte de salvare.

## 1.1.200

- **Cumpărătura pentru toată luna.** Un bon cu detergent, hrană pentru animale sau provizii golea dintr-odată plicul săptămânii (Mega Image, 165,50 lei, din care 134,58 detergent și hrana pisicii). La cheltuială, bifa „Cumpărătură pentru toată luna” împarte suma, sau doar partea scrisă, egal pe săptămâna cumpărării și pe cele rămase până la salariu. Exemplu: 134,58 împărțit pe 6 săptămâni dă 22,43 pe săptămână, iar săptămâna asta scade doar 53,35, nu 165,50. Totalul plicului rămâne același. Bifa apare la plicurile împărțite pe săptămâni, atât la notare, cât și la corectarea mișcării din Mișcări. Graficul „se golește pe …” nu mai ia o astfel de cumpărătură drept ritm de cheltuială.

## 1.1.199

- **Plicul din două surse, oricând.** La „Plic nou”, sub „Plătit din”, butonul „Plătit și din altă sursă” adaugă a doua sursă chiar și când prima ajunge (de exemplu 300 din card și 200 din cash). Înainte apărea doar când prima sursă nu avea destui bani. Se pot adăuga și mai multe surse („Încă o sursă”), iar caseta scrie exact împărțirea: „Împărțit: 95 RON din Card Raiffeisen + 5 RON din Cash”.
- **Mesaj clar când banii n-au intrat încă.** Plicul se face din banii care chiar sunt în surse. Înainte de salariu, în loc de „O completare cere mai mult decât are sursa liberă”, aplicația spune cât e liber pe sursa aleasă și ce e de făcut: notează întâi salariul și tichetele ca venit, apoi fă plicul.

## 1.1.198

Ziua salariului și ratele lui Angi, după o dimineață cu salariul pe drum (raport real, 9 oct).

- **„Salariul vine azi”.** Data salariului se putea alege doar de mâine încolo, așa că salariul care intra azi nu se putea spune. Data aleasă la întâmplare (9 noiembrie) lăsa toate ratele lunii fără salariu. Acum data de azi se poate alege, plus un buton „Salariul vine azi”: ciclul nou începe azi, iar următorul salariu e cam peste o lună.
- **Data salariului se poate scoate.** „Fără dată de salariu: arată doar câți bani am” întoarce Astăzi la banii din surse, ca înainte.
- **Astăzi arată banii pe care îi ai, nu un minus.** Când ratele până la salariu cer mai mult decât e notat, cifra mare rămâne „Ai acum în surse: 165,73”. Dedesubt scrie cât lipsește până la venit și care e prima rată (fierul, 90,25, mâine), plus butonul „Notează salariul”.
- **Ratele lui Angi, confirmate de Alin.** Confirmarea unei rate de-a ei din cardul ei (cum propune formularul) nu mai aduce toate ratele ei în socoteala lui Alin. Nici minusul de pe cardul ei, unde nu e notat niciun venit, nu-i mai scade lui banii. Ratele ei rămân în Obligații, cu reamintiri și „Confirmă plata”. Dacă una se plătește din cardul lui Alin, alege cardul lui la confirmare: atunci ratele ei se socotesc din banii familiei.

## 1.1.197

O sumă negativă mare apărută pe Astăzi, după ce s-a pus data salariului (raport real, 9 oct).

- **Lipsa pentru rate, spusă pe nume.** Cu data salariului pusă, aplicația păstrează deoparte ratele care cad până atunci. Când ele cer mai mult decât banii notați în surse, Astăzi arăta „−1.806,21 · Peste limita planului”, deși nu exista niciun plic și nu se cheltuise nimic peste plan. Acum scrie „Lipsesc pentru rate și facturi”, cu explicația: „Până pe 9 noiembrie sunt de plătit 1.971,94 în rate și facturi, iar în surse ai 165,73”. Dacă venitul ciclului nu e notat, spune și asta: notezi salariul și cifra se reface. Eticheta de sus devine „Rate de acoperit”.
- **Plicuri: „Lipsesc”, nu „Nerepartizați” negativ.** Rândul „165,73 disponibili = 165,73 în plicuri” (cu zero plicuri) socotea ratele drept plicuri. Acum ratele și facturile apar separat, iar când banii nu ajung scrie cât lipsește și de ce.
- **Ratele unui membru care nu-și notează banii.** Ratele pe numele cuiva ale cărui surse sunt goale (sold inițial 0, nicio mișcare) și care n-are nicio rată confirmată nu se mai scad din banii notați de ceilalți. Erau 925,72 lei din cei 1.806 de pe Astăzi. Ele nu dispar: Astăzi și Plicuri scriu „Nu sunt scăzute ratele pe numele Angi (925,72)”, iar reamintirile rămân. Prima rată de-a ei confirmată (din orice card) sau prima mișcare pe sursele ei le aduce înapoi la socoteală.
- Pe Astăzi, nota „Angi n-a notat încă azi: cifra poate fi mai mică” nu mai acoperă explicația unei lipse.

## 1.1.196

Fluiditate și claritate, după un video cu ecranul care „clipea”.

- **Fără clipire la prima deschidere a unui ecran.** Raportul lunii, Vacanță, Lista de cumpărături, Prețuri, Setări și celelalte ecrane din Mai mult arătau o clipă (cam 0,3 secunde) un schelet gri „Pregătim…”, apoi ecranul adevărat. Acum ecranul vechi rămâne pe loc până e gata cel nou, iar după pornire aplicația le pregătește pe toate în timpii morți, inclusiv formularele (Notează, bon, obiectiv). Prima deschidere e la fel de lină ca a doua.
- **Ecranul nou se deschide de sus.** Pe telefon pagina derulează în interior, iar ecranul deschis din Mai mult pornea la poziția celui vechi (Vacanța se deschidea la jumătatea formularului). Întors în lista Mai mult, o regăsești unde ai lăsat-o.
- **Trecere lină între ecrane.** Ecranul nou intră ușor (0,18 s, fără sacadare). Cu „Reduce mișcarea” din telefon, se schimbă direct.
- **Mai mult, regrupat pe înțeles:** Banii familiei · De rezolvat (doar când e ceva de confirmat) · Cumpărături și bonuri · Planuri (Vacanță și instrumentele avansate) · Setări · Ajutor. „Bonuri” și „Vacanță” nu mai stau sub „De rezolvat”.
- **Mișcări: „Ceva nu se potrivește?”** „Potrivește soldul cu banii reali” și „Șterse recent” stau acum într-o casetă la capătul listei, nu deasupra titlului. Avertismentele (bon incomplet, telefon cu aplicație veche) rămân sus.
- **„Plicuri”, nu „Plan”.** Textele de pe Astăzi și din Ghid spun acum „În Plicuri mai ai…”, ca bara de jos.
- **Pornește rapid** (Plicuri): fără banda goală din capul casetei.

## 1.1.195

Siguranța registrului, după un raport real: la două bonuri plătite cu voucher SGR + card/cash, partea de voucher dispăruse, cu tot cu articolele bonului. Suma rămasă era doar cea de pe card, iar voucherul apărea iar plin.

**Cauza, găsită în backup.** Ambele părți de voucher au fost șterse în aceeași milisecundă, pe 8 octombrie la 18:07:46. Un minut mai târziu, celălalt telefon al familiei s-a sincronizat pentru prima dată de pe 4 octombrie. Avea o versiune dinainte de 1.1.175, care „strângea” bonurile la pornire și ștergea partea cu bonul a plății din două surse, ca pe un duplicat al celeilalte. Ștergerea a ajuns apoi prin sincronizare pe toate telefoanele.

- **Sincronizarea nu mai acceptă ștergerea unei jumătăți de bon.** O ștergere venită de pe alt telefon care lasă vie cealaltă parte a plății din două surse, sau bonul cu articole fără mișcarea lui, e refuzată: rândul rămâne. Aplicația de azi șterge oricum bonul întreg.
- **Telefonul cu aplicație veche e semnalat în Mișcări.** Fiecare telefon scrie acum, la sincronizare, versiunea aplicației. Un telefon al familiei văzut în ultimele 30 de zile fără versiunea nouă apare cu „Actualizează aplicația pe celălalt telefon”. Se poate ascunde cu „Nu mai folosesc acel telefon”.
- **Transferul între surse se șterge întreg.** Ștergerea din Mișcări a unui „Mutat din Cash în Card” scotea doar o jumătate, așa că un sold creștea sau scădea fără motiv. Acum pleacă ambele jumătăți. La sincronizare, o jumătate ștearsă de pe alt telefon e refuzată, ca la bonuri.
- **Sursa „Voucher SGR” salvată ca tip card** e recunoscută după nume: scanarea pune plata cu voucherul pe ea, iar bilanțul SGR o socotește.
- **Restaurarea unui backup** (fără familie conectată) salvează întâi în Descărcări registrul de dinainte, ca un backup vechi ales din greșeală să nu piardă nimic.
- **Ghidul șterge bonul întreg.** Ștergerea cerută prin Ghid scoate acum tot bonul plătit din două surse, împreună cu bonul lui, ca în Mișcări.

- **„Șterse recent” în Mișcări.** Tot ce iese din registru (mișcări și bonuri cu articolele lor) se păstrează pe telefon 60 de zile, oricine l-ar fi scos: omul, o corectură, sincronizarea sau o greșeală. Din listă pui înapoi cu o atingere. Operațiile în masă (închiderea anului) nu umplu lista.
- **Avertisment „Bon incomplet”.** Fiecare parte a unui bon plătit din două surse ține acum totalul bonului. Dacă suma părților nu mai dă totalul, Mișcări arată pe loc „Bon de 20,36, în registru 8,36. Lipsesc 12,00 din Voucher SGR”. Butonul „Repară” aduce partea lipsă din „Șterse recent”, cu bonul și articolele ei. Dacă nu o găsește acolo, o reface din total, pe sursa știută. Merge și pentru bonurile vechi, din nota lor.
- **Corectura bonului pe două surse.** Articolele apar oricare parte ai deschide, iar bonul rămâne legat de prima parte după salvare. Înainte, deschisă din partea fără bon, corectura nu arăta articolele și le dezlega. „O singură sursă” cere acum confirmare și spune exact ce parte iese din registru. Ștergerea unui bon pe două surse scoate și bonul legat de oricare parte.
- **Fără notă scrisă de aplicație.** „Bon de 20,36: 12,00 din Voucher SGR și 8,36 din Card” nu mai apare în notița omului. Legătura dintre părți o ține aplicația separat.
- **Cheltuiala cu categoria „Venit”.** Notată din greșeală ca venit și trecută apoi la Cheltuială, mișcarea își păstra categoria „Venit”. Acum primește categoria după nume (Taxi → Transport). Mișcările deja salvate așa se repară singure la pornire.
- **„Potrivește soldul” oricând, din Mișcări.** Scrii câți bani ai de fapt (de exemplu în Cash), iar diferența intră ca „Corecție de sold”. Soldul devine cel real, iar diferența nu umflă nicio categorie (Alimente) în analiză. Înainte, întrebarea apărea doar o dată pe săptămână, pe Astăzi.
- **Reamintirile care nu sosesc.** Pe Android, aplicația ține minte la ce oră trebuia să sune fiecare reamintire și când a sunat de fapt. Dacă una s-a pierdut, Setări → Reamintiri spune „Reamintirea de joi, 21:00 nu a sosit: telefonul a oprit aplicația în fundal”. Butonul „Deschide setarea” duce direct la pornirea automată (Huawei, Honor, Xiaomi, Oppo, Vivo) sau la baterie. În browser, reamintirea întârziată mai mult de jumătate de oră nu se mai arată: Chrome îngheață fila din fundal, iar „Check-in de seară” sosea la 1:07 noaptea.
- **Fișierele de backup au data și ora în nume.** Salvarea automată rescrie același fișier din Documente/Buget Familie, iar numele lui arată ora ultimei salvări (`buget-familie-automat-2026-10-09-0101.json`). Și copia săptămânală din Descărcări are acum ora în nume (`buget-familie-copie-2026-10-09-0700.json`).
- **Bilanțul SGR** în Prețuri: cât ai plătit garanție pe bonuri și cât ai recuperat la reciclare (voucherele notate ca venit), luna asta și anul acesta.
- **Reducerea de pe rândul bonului** nu se mai pierde la repornire (se păstra doar până la închiderea aplicației).
- **Test nou cu aplicația reală, la fiecare schimbare** (și în revizia de luni și joi): bon scanat pe voucher + card, salvare, repornire, corectură, pierderea unei părți, „Repară”, „Șterse recent”.

## 1.1.194

- **Bon lung de hârtie, din mai multe poze.** După fiecare poză cu camera alegi „Citește bonul” sau „Mai fă o poză” cu partea următoare, până la 6. Pozele se citesc împreună, ca un singur bon, la fel ca la capturile din galerie.
- **Salvarea automată după o reinstalare.** Pe Android 11 și mai nou, aplicația reinstalată nu mai poate rescrie fișierul vechi, așa că Android face „buget-familie-automat (1).json”. Înainte, la fiecare salvare apărea încă un fișier nou: (2), (3)… Acum se rescrie mereu același fișier, iar în Setări scrie exact numele lui.
- **Reducerea stă separat de numele articolului.** Pe bonurile scanate, „(reducere −2,45)” nu mai intră în nume. Apare ca rând mic sub articol și se păstrează pe bon. Numele rămân curate pentru sugestii și pentru istoricul de prețuri. Produsele cântărite scanate primesc „× 0,456 kg”, ca istoricul să compare pe kilogram.
- **Test de pază pentru pluginurile Android.** Un test oprește greșeala care a blocat „Salvează pe telefon” în 1.1.191, oriunde ar mai apărea.

## 1.1.193

- **„Notează” are și „Ce ai cumpărat (opțional)”** lângă magazin. Mișcarea se numește „Lidl · pâine”, iar articolul intră ca rând de bon, deci și în istoricul de prețuri, fără să deschizi cheltuiala detaliată. Categoria se ia după articol. Cu tastatura deschisă nu mai rămâne un gol sub butoane (rezerva barei de jos a telefonului).
- **Sugestii de articole din bonurile tale.** Când scrii un articol, în „Notează” sau în cheltuiala detaliată, apar denumirile din bonurile salvate, scanate sau scrise, cele mai cumpărate primele. Alegi una și vin categoria și ultimul preț. Așa același produs are mereu același nume, iar istoricul de prețuri îl recunoaște.
- **Cantitate pe articol: bucăți sau kg.** Lângă categoria fiecărui articol scrii câte bucăți sau câte kilograme (butonul „buc/kg” schimbă unitatea), iar suma se face singură: „2 buc × 4,55 = 9,10”. Pe bon rămâne un rând „Crenvurști × 2”, iar „Unde a fost mai ieftin” compară prețul pe bucată sau pe kilogram.
- **Bonurile scanate intră corect în „Unde a fost mai ieftin” și în coșul etalon.** Magazinul apare ca „Profi”, nu „Cumpărături Profi”, așa că bonurile scanate și cele notate de mână se adună la același magazin. Prețul se compară pe bucată: „× 2” se împarte la 2, iar „(reducere −2,45)” nu mai face din același produs unul nou. La produsele cântărite rămâne prețul plătit.

## 1.1.192

- **Bon din mai multe capturi.** Un bon digital lung (de ex. din aplicația Profi) se poate scana din galerie alegând toate capturile lui, până la 6. Se citesc împreună, ca un singur bon. Rândurile prinse în două capturi se numără o singură dată, iar produsele repetate pe bon (doi crenvurști, la 4,54 și 4,55) rămân amândouă. Sub butonul de scanare scrie cum se face. Pe bonurile digitale, suma deja redusă nu se mai reduce încă o dată. Testul de după publicare citește și un bon Profi din 4 capturi (82,71 lei).
- **„Salvează pe telefon” și salvarea automată merg din nou.** Butonul rămânea la „Se salvează…” și fișierul automat nu se scria. Cauza: pluginul nativ era așteptat ca o promisiune, iar așteptarea nu se termina niciodată. Același lucru oprea și culorile telefonului. Testul de backup imită acum pluginul real, ca greșeala să nu mai treacă neobservată.
- **Salvarea automată pornește imediat.** Înainte, fișierul apărea abia la prima mișcare nouă după „Pornește”. Acum se scrie în câteva secunde după ce o pornești. Starea arată și unde e: „în Fișiere: Documente → Buget Familie” (`buget-familie-automat.json`).
- **Ghidul nu mai intră sub bara telefonului.** Cu tastatura deschisă, panoul de chat urca până sub ceas și baterie. Acum se oprește sub bara de sus.

## 1.1.191

Ideile din revizia automată (#67):

- **Cadranul „Sănătatea banilor” duce la cauză.** În foaia scorului apare ce trage scorul cel mai mult în jos (marja, plicurile, scadențele sau ritmul), cu un buton care duce direct acolo: Plicuri, Obligații sau Mișcări.
- **Scanarea arată ce face.** Cât citește apare un cronometru („Citesc bonul… 6 s”). Dacă durează, spune că serverul e aglomerat, iar după 30 de secunde, că citește rezerva (Claude). După citire scrie dacă bonul l-a citit rezerva.
- **Când totalul bonului nu bate,** pe lângă diferență apare un sfat de fotografiere (întins, drept de sus, lumină bună) și butonul „Scanează din nou”.
- **Pe Astăzi, în „Mai mult din ziua asta”:** „Ultima copie de siguranță: acum 9 zile”, cu „Fă o copie”. Linia e evidențiată când copia e mai veche de 30 de zile sau nu există.
- **Consultantul pentru cine nu are Familia:** apare prima frază a raportului, calculată pe telefon, fără AI („În ritmul de acum, luna se încheie cu 12% peste media lunilor trecute. Alimente crește cel mai repede.”). Restul raportului e estompat, cu oferta Familia.

## 1.1.190

- **Bonul scanat se verifică pe loc.** Sub rânduri apare „✓ Rândurile bat cu totalul bonului”. Dacă nu bat, apare cu roșu cât lipsește sau cât e în plus față de total („Lipsesc 4,99 lei… Poate un produs n-a fost citit”). Diferența se recalculează la fiecare corectură. Când lipsesc bani, „Adaugă un rând cu diferența” pune un rând „Diferență față de bon” la Altele.
- **Server, scanarea bonului mai rapidă când Gemini e aglomerat.** Gemini are cel mult 30 de secunde (15 pe model), apoi citește rezerva Claude Sonnet. Înainte, trei modele Gemini blocate țineau omul peste un minut. Testul de după publicare și revizia verifică acum drumul din aplicație (Gemini, apoi rezerva), nu doar Gemini, și spun când a citit rezerva.
- **Revizia are explorare liberă.** Pe lângă verificările fixe, la fiecare revizie Haiku alege singur o zonă din cod pe care n-a mai cercetat-o. Ține minte zonele din rapoartele trecute și preferă fișierele schimbate recent sau uitate. Citește zona ca un revizor și scrie în raport problemele găsite (fișier:linie, exemplu concret, gravitate, reparație), idei și un test nou propus. Doar citește, nu schimbă nimic. Costul crește la ~1 ban pe revizie.
- **Reamintire pentru copia de siguranță.** Dacă ultima copie e mai veche de 30 de zile (sau nu există niciuna, după o lună de notat), vine o notificare duminică la 18:30, o dată pe săptămână, până faci una. Contează și salvarea automată. Se poate opri din Setări → Reamintiri → „Copia de siguranță”.

## 1.1.189

- **Amintirea de seară vine la ora aleasă.** Era pusă ultima în lista de reamintiri, iar telefonul primea doar primele 7, așa că în zilele cu multe alerte cădea. Acum lista e în ordinea orei (cele mai apropiate întâi), până la 12. Reamintirile se programează cu alarma sistemului („allow while idle”), care sună și cu telefonul în repaus. WorkManager le întârzia ore întregi pe unele telefoane. După repornirea telefonului sau o actualizare, alarmele se pun din nou singure.
- **Fontul mare al telefonului nu mai strică ecranele.** Am verificat toate meniurile la 360 și 412 px, cu fontul la 130%:
  - „NEREPARTIZAȚI” nu mai intră sub sumă în Plicuri;
  - în Setări, ora amintirii de seară nu mai e strivită, iar butoanele de backup sunt pe rânduri;
  - sumele din „Bilanțul săptămânii” și de pe Astăzi, rândurile din Mișcări, „Ultimele mișcări” și categoriile din Gospodărie nu se mai taie cu „…”; se rup pe două rânduri.
  - Testul automat de interfață verifică de acum și textele tăiate și are o trecere cu fontul la 130%.
- **Notează:** la Cheltuială nu mai apare câmpul „Ce venit?”, care era al venitului.
- **Backup:**
  - „Salvează pe telefon” arată acum sub butoane unde și la ce oră s-a salvat (sau de ce nu), plus „Se salvează…” cât lucrează.
  - Salvarea automată are butoane „Pornește / Oprește” și starea scrisă clar („Pornită · ultima salvare 08:23”), în loc de o bifă.
- **Revizia aplicației, luni și joi dimineața** (`.github/workflows/weekly-review.yml`). Rulează toate verificările: tipuri, stil, teste unitare, funcțiile, ecranele pe telefon cu font 130%, fluxurile de bază, serverul real (bonuri, ghid, consultant) și pachetele cu probleme de securitate. Apoi Claude Haiku 5.5 citește rezultatele și deschide un Issue „Revizia din …” cu eticheta `revizie`, pe care GitHub îl trimite și pe mail. Raportul are tabelul verificărilor, problemele cu cauza și reparația, ce merită urmărit și idei de îmbunătățire. Costă cam 1–2 cenți pe revizie.
- **Astăzi:** golul de sub „Mai mult din ziua asta” e umplut de cadranul „Sănătatea banilor, de la 0 la 100”, cu explicația a ce măsoară (marja până la venit, plicurile în limită, scadențele din 7 zile, ritmul de cheltuire). Pe telefoanele obișnuite pagina încape întreagă, fără scroll, iar cadranul se potrivește înălțimii ecranului.

## 1.1.188

- **Consultantul financiar** (Analiză → Asistent, abonamentul Familia): la „Cere raportul lunii” primești o evaluare sinceră a lunii față de lunile trecute (Pe drumul bun / Atenție / Risc), cel mult trei pași concreți cu suma pe lună, ce urmează să fie urmărit și un lucru făcut bine. Cifrele le calculează telefonul; la AI pleacă doar un rezumat (totaluri pe luni și categorii, plicuri, datorii, obiective, fondul de urgență), fără mișcări, magazine, notițe sau nume. Pașii cu sume mai mari decât venitul lunar sunt aruncați. Raportul rămâne pe telefon, se poate actualiza (6 pe zi), iar spre final de lună cardul spune că raportul lunii e gata de cerut.
- Ghidul online răspunde din nou cu **Gemini**: lista lui de modele era scrisă de mână, iar modelele vechi răspundeau 404, așa că ghidul cădea mereu pe Groq. Acum folosește aceeași alegere automată ca la bon (Flash Lite întâi), cu gândire scurtă.
- Ledul de sub robot are acum și numele celui care a răspuns: **Telefon** (verde), **Gemini** (mov), **Groq** (negru). Același led apare pe raportul consultantului.
- Ghidul de pe telefon rămâne primul și singurul care merge fără internet; Gemini și Groq intră doar când el nu înțelege.
- Testul de după publicare verifică și ghidul și consultantul.

## 1.1.187

- Scanarea bonului citește întâi cu **Gemini Flash Lite**, care a fost cel mai rapid și corect pe toate cele 4 bonuri de test (3–6 s). Dacă Gemini e plin sau dă eroare, citește **Claude Sonnet 5.5**, tot 4/4 corecte, puțin mai lent. Claude Haiku a fost scos, pentru că a mutat prețurile pe bonul mototolit.
- Modelele Gemini se aleg din lista Google, iar modelele pline sunt sărite imediat. Dacă tot nu merge, mesajul arată un cod scurt cu motivul.
- După fiecare publicare a funcțiilor rulează automat un test cu patru bonuri reale (total, articole, categorii, timp sub 30 s).
- Acordul de la prima scanare și politica de confidențialitate pomenesc și Anthropic Claude, ca rezervă.

## 1.1.186

- **Scanează bonul**: în Notează (și în Adaugă mișcare), o poză la bon (sau din galerie) scoate toate produsele, fiecare cu suma și categoria lui (alcool → Băuturi, ciocolată și napolitane → Dulciuri, apă îmbuteliată → Apă, garanția SGR → SGR, sacoșa → Sacoșe, mezeluri → Alimente). Reducerile apar pe rândul produsului („… × 6 (reducere −1,74)”), cu suma plătită, iar totalul reducerilor apare deasupra. Se completează singure totalul, data, magazinul și, la plata din două surse (voucher Returo + numerar), ambele surse cu sumele lor. Nimic nu se salvează până nu apeși Salvează.
- Citirea o face Google Gemini, prin funcția noastră `readReceipt`. La prima folosire aplicația cere acordul. Poza se micșorează pe telefon, pleacă o dată și nu se păstrează nicăieri. Limită: 25 de bonuri pe zi pe telefon.
- Categorie nouă **Haine** (haine, încălțăminte, ciorapi, teniși; magazine ca Sinsay, H&M, Zara), cu iconiță. Dacă o familie își făcuse deja o categorie proprie „Haine”, nu mai apare de două ori. SGR și Sacoșe au și ele iconițe.
- Reparat: corectarea unui bon plătit din două surse, deschis din Mișcări sau de pe Astăzi, arăta totalul greșit (39,76 + 11,26 = 51,02), pentru că formularul pornea de la rândul unit și aduna încă o dată partea a doua. Acum pornește de la mișcarea salvată: 39,76, cu 28,50 + 11,26. Un câmp de afișare care ajunsese în date la o astfel de corectură se curăță singur.
- Microfonul („Spune ce ai cumpărat”) apare din nou la Cheltuială în Notează. Dispăruse în 1.1.163, la scurtarea ecranului, și rămăsese doar la Venit, cu text de cheltuială. La Venit scrie acum „Spune ce a intrat”, iar ce spui acolo rămâne venit.
- SGR și Sacoșe sunt acum două categorii separate. Ce era deja notat la „SGR și sacoșe” se mută singur: sacoșele la Sacoșe, restul la SGR.
- „SGR” scris pe eticheta unei sticle („Apă plată PET 2L SGR”) nu mai trimite produsul la SGR; doar rândul de garanție merge acolo.
- Citirea e mai robustă: dacă Gemini respinge cererea cu schemă sau răspunde cu ceva greu de citit, reîncearcă fără schemă, apoi cu alt model. Când tot nu merge, mesajul arată un cod scurt (modelele încercate și răspunsul lor), ca problema să poată fi trimisă.
- Avertisment când suma articolelor nu bate cu totalul sau când poza a fost greu de citită.
- Scanarea face parte din Familia (inclusă în proba de 30 de zile); până la pornirea plăților e deschisă tuturor. Nu apare în modul „doar offline”.
- Politica de confidențialitate, pagina Despre și ghidul AI spun acum cum funcționează scanarea; a dispărut o mențiune rămasă despre descărcarea programului vechi de citire de pe jsDelivr.

## 1.1.185

- Bon plătit din două surse = un singur rând: în Mișcări și pe Astăzi apare o dată, cu totalul (ex. Exflor −39,76) și ambele surse („Voucher SGR + Cash Alin”). În spate rămân două mișcări, câte una pe sursă, ca soldurile să fie corecte. Funcționează și pentru perechile făcute înainte.
- Ștergerea unui astfel de bon scoate ambele părți (cu „Anulează”).
- Numărul de mișcări de azi numără bonul o dată.

## 1.1.184

- Bon plătit din două surse: cele două cheltuieli sunt legate (`splitId`). Corectarea oricăreia deschide tot bonul: suma totală (ex. 39,76), „Plătit din două surse” deschis, cu ambele sume (28,50 voucher, 11,26 cash). Salvarea le actualizează pe amândouă, fără a treia mișcare; nota „Bon de …” se înlocuiește, nu se adaugă din nou.
- Perechile făcute în 1.1.180–1.1.183 (fără legătură) se recunosc după nota „Bon de …” identică, aceeași zi și același titlu.
- „O singură sursă” la corectare scoate a doua parte (cu ștergere sincronizată), iar totalul trece pe prima sursă.
- Articolele bonului împărțit stau pe prima parte, cu totalul întreg al bonului.
- Soldul arătat lângă surse, la corectare, include ambele părți ale bonului.

## 1.1.183

- Astăzi → Ultimele mișcări: „acum” / „acum N min” apar doar la mișcările de azi. O cheltuială de ieri corectată acum (de exemplu împărțită pe două surse) arată data ei, nu „acum”, ca să nu pară mutată pe azi.

## 1.1.182

- Backup: comutator nou „Salvare automată la fiecare modificare” (Setări → Copii de siguranță). În aplicația Android, fișierul `buget-familie-automat.json` din **Documente/Buget Familie** se rescrie singur la 3 secunde după fiecare schimbare (un singur fișier, nu câte unul nou). Arată ora ultimei salvări și motivul, dacă n-a mers. Se importă ca orice backup.
- Nativ: metoda `writeLiveBackup` (MediaStore, Documente/Buget Familie; suprascrie fișierul propriu, cu „wt”).
- Copia săptămânală din Descărcări rămâne, separată.

## 1.1.181

Creștere și încredere:
- Tot ce se trimite pe WhatsApp (bilanțul săptămânii, raportul lunii, imaginea lunii, obiectivul atins) se termină cu un rând: „Notat în Buget Familie, caietul de buget al casei. Nu e aplicație de plăți și nu cere date bancare.” și linkul paginii de prezentare.
- „Nu e o aplicație de plăți și nici de monitorizare”: la prima pornire, în Confidențialitate, pe pagina „Despre” (cu o întrebare nouă „E o țeapă?”) și în descrierea pentru Play.
- Mai mult: ecranele de zi cu zi la vedere; graficele, tendințele, planul pe 12 luni, investițiile, averea, prețurile, regulile și „Ce am învățat” stau sub „Instrumente avansate”, care se deschide la atingere. „Raportul lunii” urcă la Ecrane.
- Plată din două surse: în câmpul primei surse se poate scrie virgula („28,50”); înainte, „28,” se rescria imediat ca „28”.
- `docs/kit-lansare.md`: pornirea plăților, producția pe Play, mesaje pentru testeri, răspunsul la „țeapă”, idei TikTok și postări pentru grupuri.

## 1.1.180

- Plată din două surse: două câmpuri de sumă, „Din {prima sursă}” și „Din a doua sursă”. Scrii oricare, cealaltă se completează din total.
- La corectarea unei cheltuieli, soldul arătat lângă sursă e cel de dinaintea ei (Voucher SGR arăta 0,74 lei, adică deja fără suma corectată).
- În lista surselor nu se mai repetă numele: „Cash Alin · 160,05 RON”, nu „Cash Alin · Alin · 160,05 RON”.

## 1.1.179

Trecere prin toată aplicația, ca utilizator:
- Astăzi: cardul „Cum plătește casa” devine „Bilanțul săptămânii”: rezumat + „Trimite pe WhatsApp”. Fără texte despre abonament, preț sau Google Play cât plata e oprită; „Invită partenerul” doar dacă al doilea telefon nu e încă în cameră. Toate ofertele „Familia” tac cât plata e oprită.
- Astăzi: „Unde sunt banii · Mută” stă deasupra lui „Notează”, deci se vede și când restul zilei e strâns (de aceea nu se găsea mutarea). Eticheta cifrei spune mereu ce e cifra; partenerul care n-a notat apare ca notă dedesubt, fără „ea”. Chip-ul vechi „Obiectiv și unde stau banii” devine „Obiectiv și evenimente”.
- Plicuri: lângă „Nerepartizați”, „Mută bani sau dă cuiva”. Notează: „Mută bani: cash, între carduri sau partenerului”.
- Mișcări: un bon pe articole nu mai înghesuie produsele în rând (sumele erau tăiate); scrie „Bon pe articole · N produse”.
- Sincronizare: fără golul mare din cardul de sus. De verificat: coada goală are bifă, nu X. Setări: „Confidențialitate” (fără „abonamentul Familia”) cât plata e oprită.
- Surse: tip nou „Voucher (SGR, cadou)”; la sursă nouă se poate alege „Familie / comun”.
- Cheltuială: „+ Plătit din două surse (ex. voucher și cash)”: o parte dintr-o sursă, restul din alta; se salvează două cheltuieli legate, cu nota bonului.
- Data: buton de calendar lângă câmp (se poate și scrie).
- Venit: exemplul de denumire e „Salariu, Voucher SGR”, nu „Cumpărături Lidl”. „Cheltuială” / „Venit” selectat are text alb, nu verde pe verde.
- Articolele de pe bon își ghicesc categoria după nume: vodca → Băuturi, Kinder → Dulciuri, garanția SGR și sacoșa → categoria nouă „SGR și sacoșe”.
- Curățenie CSS: regulile pozei de bon și ale rândului vechi de surse, rămase fără folos.

## 1.1.178

- Notificarea „Azi la mâncare” poartă data locală a zilei, nu cea UTC. Pe fusurile la est de UTC (testul de deploy rulează pe Pacific/Auckland), 8:30 cădea în ziua de ieri și deploy-ul site-ului pica din 1.1.175.

## 1.1.177

- Astăzi: butonul „Unde sunt banii · Mută” sub cifra mare, și în modul simplu. Arată soldul fiecărei surse (și al cui e) și pe ce categorii s-a cheltuit luna asta.
- De acolo, „Mută bani sau dă cuiva” deschide direct mutarea între surse. Un membru fără sursă (de exemplu soția) apare ca „Cash {nume} (nou)”: la salvare i se face sursa și banii trec la ea, fără să fie cheltuială.
- Mutarea arată la fiecare sursă soldul și al cui e; pornește din sursa cu cei mai mulți bani.

## 1.1.176

Bonurile se scriu doar de mână; citirea bonului din poză e scoasă de tot:
- Codul de citire (OCR, tesseract.js) și pachetul lui au ieșit din aplicație; site-ul nu mai permite descărcarea lui de pe jsDelivr.
- Pozele rămase din versiunile vechi se șterg de pe telefon la pornire (baza IndexedDB a pozelor și câmpurile din bonuri). Bonurile rămân, cu magazinul, totalul și articolele.
- Lista de bonuri nu mai arată miniaturi sau „Bon în două fotografii”; ștergerea bonului nu mai vorbește despre fotografii.
- Textele din aplicație (Bonuri, Sync, De verificat, catalog, formularul de bon), politica de confidențialitate, pagina „Despre”, pagina de ștergere a datelor, fișa Play și ghidul „Siguranța datelor” nu mai pomenesc poze sau OCR.

## 1.1.175

Audit, a doua trecere:
- Bonuri, la pornire și la fiecare sincronizare: „strângerea” bonurilor vechi putea șterge un bon confirmat, sau cheltuiala cu bonul atașat, când în aceeași zi era altă cheltuială cu suma apropiată (±1 leu). Acum atinge doar bonurile vechi sparte pe produse, și doar când și numele, și suma se potrivesc.
- Cheltuială detaliată deschisă fără nicio sumă scrisă nu mai face un bon gol în Bonuri.
- Notificarea de dimineață „Azi la mâncare”, programată pentru a doua zi, arată suma zilei aceleia, nu a zilei de azi. Cu plicul gol nu mai scrie o sumă cu minus.

## 1.1.174

Audit:
- Bonuri: editarea unui bon legat de o cheltuială notată de mână ștergea cheltuiala (și, prin sincronizare, și de pe telefonul partenerului). Acum bonul rămâne detaliu, cheltuiala rămâne.
- Bonuri: ștergerea unui astfel de bon scotea și cheltuiala. Acum pleacă doar bonul și mișcările făcute de el.
- Navigare: fără rețea, dacă o bucată a ecranului nu se încarcă, meniul schimbă totuși ecranul (arată „offline”), nu rămâne blocat.
- Pachete: proxy-addr, dompurify și @grpc/grpc-js urcate peste versiunile cu probleme de securitate (`pnpm audit`: 0).

## 1.1.173

- După trei zile cu cheltuieli, Azi rămâne cifra și Notează. Restul stă sub „Mai mult din ziua asta”.
- Cifra zilei spune „incompletă” când partenerul n-a notat azi. Nu te baza pe ea la magazin.
- Amintirea de seară merge la cine n-a notat, chiar dacă celălalt telefon a notat deja. Cine a notat nu mai e întrebat.
- Prețul de 149 lei/an apare abia după ce al doilea telefon notează o mișcare. Până atunci, bilanțul și invitația rămân gratuite. Plata în Play e încă oprită.

## 1.1.172

- Prima deschidere cere trei lucruri: salariul, data lui, plicul de mâncare. Apoi un număr: cât poți cheltui azi. Analiza, temele și asistentul revin după trei zile cu cheltuieli.
- Notificarea de dimineață „Azi mai ai X la mâncare” se programează și cu aplicația închisă.
- Când plata e pornită: primul bilanț pe WhatsApp rămâne gratuit. Al doilea bilanț și invitația către al doilea telefon pornesc proba de 30 de zile. Prețul de pe ecran e 149 lei/an. Registrul nu se blochează. În acest build plata e încă oprită.

## 1.1.171

- Meniul schimbă ecranul din prima. Fără așteptare și fără alunecarea care pâlpâia.

## 1.1.170

- Capacitor Android 8.5.2. Închide gaura prin care un conținut din afară putea fi încărcat ca aplicația.

## 1.1.169

- Textele nu mai promit poză la bon. Bonul se scrie de mână.
- O rată plătită pe jumătate nu se mai bifează. Scrie cât s-a plătit și cât lipsește.
- Un credit lung nu se mai numește scadențar complet: sunt primele 120 de rate.

## 1.1.168

- Blocul de articole e mai scurt: fără titlu mare, rânduri mai joase, butonul de adăugare mai mic.

## 1.1.167

- Categoria articolului stă pe rândul de dedesubt, pe toată lățimea. Nu se mai taie la „Alim...”.

## 1.1.166

- Articolele stau pe un rând: ce ai cumpărat, lei, categorie. Lista nu mai crește în jos la fiecare produs.

## 1.1.165

- Articolul de pe bon are trei câmpuri cu nume: ce ai cumpărat, cât a costat, categorie.
- Ce nu știi nu se mai numește „Rest bon”. Se numește diferență neînregistrată.

## 1.1.164

- Când planul e depășit, cifra mare are minus în față. Nu mai pare că ai banii aceia.
- Sub Gata, la cheltuială: „Cheltuială detaliată: scrie articolele de pe bon”. De acolo se scriu articolele, nu din Mișcări după.

## 1.1.163

- Sub cifra mare scrie ce este: rămas de cheltuit azi, rămas în plicuri sau rămas în surse.
- Notează, la cheltuială: sumă, magazin, Gata. Cine, sursa și categoria stau după un buton. Alegerea din plic sau din nerepartizat rămâne când există amândouă.

## 1.1.162

- Grupul de backup rămâne deschis după ce intri din Mai mult. Înainte React îl închidea la loc.

## 1.1.161

- Mai mult → Backup deschide direct copiile de siguranță, nu setările de sus.
- Temele se numesc Alb, Întunecat și Bleumarin. „Atelierul de grafice” se numește Grafice.

## 1.1.160

- Plicuri, Obligații și Analiză nu mai trec prin „Pregătim…”. Ecranul nou apare direct.

## 1.1.159

- Schimbarea de ecran nu mai estompează două pagini una peste alta și nu mai arată „Pregătim…” la fiecare intrare. Ecranul vechi rămâne până e gata cel nou, apoi trece dintr-o dată.

## 1.1.158

- Dacă există și un plic potrivit și bani nerepartizați, cheltuiala nu mai alege plicul singură. Apar două variante: din plic sau din nerepartizat. A doua se închide când suma nu încape, cu cât lipsește.

## 1.1.157

- În Mișcări, o cheltuială cu bon arată articolele pe loc. Din cheltuială: „Adaugă articole”, fără a doua mișcare. Restul sub total intră singur.
- „În afara plicurilor” nu mai apare pe rânduri cât nu există niciun plic.

## 1.1.156

- Bonul confirmat e o singură cheltuială, cu totalul. Produsele rămân detaliu, nu câte o mișcare.
- Dacă cheltuiala e deja notată (Exflor 64,95), bonul se leagă de ea. Nu se mai dublează. La salvare poți alege cheltuiala existentă sau una nouă.
- Bonurile deja sparte pe produse se adună la deschidere: rămâne cheltuiala notată, liniile duplicate ies.

## 1.1.155

- Bonul salvat arată produsele pe rânduri, cu suma în dreapta, nu într-o singură frază.
- Liniile pot fi sub totalul bonului. Diferența (ecotaxă, rotunjire, produs nenumit) intră singură ca „Rest bon”. Salvarea se oprește doar dacă liniile trec peste total.

## 1.1.154

- Fără plicuri, cifra mare de pe Astăzi e ce a mai rămas în surse, nu venitul brut. O cheltuială o scade. Cu plicuri, rămâne „Poți folosi azi” sau „Rămas în plicuri”.

## 1.1.153

Sync familie — administratorul camerei:
- Telefonul care creează camera e administratorul. Doar el trimite invitații, scoate și reactivează telefoane și schimbă invitația; ceilalți văd cine e administratorul.
- Camerele de dinainte primesc ca administrator primul telefon care se conectează după actualizare.
- Administratorul poate da rolul altui telefon („Fă-l administrator”). Cine intră cu codul de recuperare devine administrator (pentru telefonul pierdut).
- O cameră nouă pornește cu lista de telefoane goală, fără telefoanele vechi.

## 1.1.152

- Sync: răspunsul la „Intră în familie” (eroare sau motiv) apare chiar sub buton. Înainte era jos, sub istoric, și părea că nu se întâmplă nimic.
- O invitație veche, a unei camere închise la „Mută familia”, spune limpede ce e de făcut: invitația nouă de pe telefonul conectat sau, dacă nu mai e niciunul, „Creează camera” (datele rămân pe telefon).

## 1.1.151

Sync familie:
- Banda „Sincronizarea familiei e oprită… Reconectează” stă sub bara de stare Android; butonul se poate apăsa.
- Un telefon scos din cameră (revocat) intră din nou cu invitația, la „Am primit o invitație”. Înainte era refuzat și cu invitația.
- Telefoanele din cameră apar ca „Aplicația pe Android”, „Browser pe Android”, „Browser pe iPhone” sau „Browser pe calculator”, nu toate „Android”. Eticheta se actualizează la următoarea conectare.
- Linkul de invitație deschis în browserul de pe Android arată sus butonul mare „Deschide în aplicație”, care pornește aplicația cu invitația.

## 1.1.150

În aplicația Android (APK/AAB):
- „Ești sigur?” (ștergere, confirmări): butoanele nu mai intră sub bara de navigare a telefonului; panoul are dedesubt spațiul barei.
- „Notat · … Anulează” apare deasupra barei de jos a aplicației, nu sub ea. Poziția folosea `env(safe-area-inset-bottom)`, care în WebView-ul Android e 0; acum folosește înălțimea barei trimisă de aplicație, ca restul ecranelor.
- Au ieșit regulile vechi ale panoului de încărcare, acoperite complet de scheletul nou (plafonul de CSS rămâne la 932 KB).

## 1.1.149

- Codul revine exact la 1.1.148: cele 11 schimbări făcute direct pe main pe 03.10, între 20:50 și 21:29 (culori de temă în 31 de fișiere, „Mai mult” în trei grupuri, Analiză, traduceri într-un fișier separat, plafonul de CSS urcat la 933, iconul și sigla), sunt anulate la cererea proprietarului. Rămân în istoric (4d5f22c și cele dinainte), dacă vreuna trebuie recuperată.
- Versiune nouă (versionCode 150), ca un AAB construit acum să treacă de cele urcate deja.

## 1.1.148

- Nuanțele Sepia și Copil ajung și în Tutorial: cardul de sus și butonul activ („1 Astăzi”) nu mai sunt verde închis; eticheta de sus se citește pe fundalul nou.
- Haloul din colțul de jos al fundalului „Lumină curată” e cald în Sepia (era albastru și apărea ca o fâșie deasupra barei de jos).
- Mai mult: rândul cu versiunea, Confidențialitate, Termeni și Suport stă jos, aproape de bară.
- Două reguli vechi, acoperite complet de cele noi, au ieșit (plafonul de CSS rămâne la 932 KB).

## 1.1.147

- Tutorial: butoanele de la final („Reia turul”, „Reia configurarea casei”) nu mai stau lipite de marginea cardului.
- Nuanțele Sepia și Copil ale temei Alb ajung și la bara de jos: fundalul ei și butonul activ erau verzi-gri, cu culorile scrise direct pentru Alb. Acum urmează nuanța (și culorile telefonului, pe Android 12+). Și fundalul de sub aplicație (#root) are culoarea nuanței.

## 1.1.146

- Sfatul zilei despre abonamente, corect gramatical: „cele pe care nu le mai folosești sunt bani dați degeaba” (era „unul … e bani dați degeaba”).

## 1.1.145

Salutul de pe Astăzi:
- „Bună dimineața” doar până la 11; de la 11 e „Bună ziua” (la 11:59 spunea încă „dimineața”).
- Fără „Bună dimineața, Eu”: numele pus implicit de aplicație („Eu”) nu mai apare în salut până nu-l schimbați.
- Sfaturile zilei, rescrise să fie limpezi. „Un abonament neuitat e cel mai ieftin abonament” devine „Verifică o dată pe lună abonamentele: cele pe care nu le mai folosești sunt bani dați degeaba.”

## 1.1.144

- „10 lei jucării” (scris sau spus) ajunge la **Consumabile copil**, nu la Alimente. Categoria se ghicea doar după magazin (Noriel, Smyk); acum și după lucrul cumpărat: jucării, Lego, păpușă, pluș, cărucior, suzete, hăinuțe, „pentru copii”.

## 1.1.143

Notarea cu vocea în browser (Chrome pe Android, versiunea web):
- „30 de lei taxi” nu se mai pierde. Chrome dă rar rezultatul final la o frază scurtă și uneori se oprește fără el; acum aplicația ține și textul parțial și îl folosește când ascultarea se termină.
- Atingerea „oprește” încheie ascultarea păstrând ce s-a auzit (înainte o anula și arunca tot).
- Cât ascultă, sub „Te ascult…” apare ce a auzit până atunci.
- Dacă nu a auzit nimic, spune asta, cu un exemplu, în loc să tacă.

## 1.1.142

Aspect, grafică, modernizare:
- **Atelierul de grafice** (Mai mult → Planificare): fluxul banilor (de unde vin, unde se duc, cu benzi proporționale; atingeți o sursă sau o categorie ca s-o urmăriți), categoriile ca dreptunghiuri pe măsura sumei, lunile anului cu veniturile peste cheltuieli, ritmul lunii față de luna trecută (în primele zile: luna trecută întreagă) și harta anului — fiecare zi din ultimele 53 de săptămâni, colorată după cât s-a cheltuit. Perioadă: luna asta, trecută, 3 luni, 12 luni. Graficele se „citesc cu degetul” (sau cu săgețile): o bulă arată valoarea exactă. Desenate în aplicație, fără bibliotecă nouă.
- **Asistentul răspunde cu grafice**: „cum au evoluat cheltuielile pe alimente?”, „la Lidl în ultimele 12 luni” — media pe lună, luna cea mai scumpă și barele lunilor; „cât am cheltuit pe…” vine cu ultimele 6 luni; comparațiile cu cele două perioade una lângă alta.
- **Mișcare**: tranziție între ecrane (vechiul se stinge, noul urcă ușor; bara de jos și antetul stau pe loc), vibrația scurtă a sistemului la schimbarea ecranului, la o notare salvată și la o ștergere (pe Android, fără permisiuni noi), ecranele care se încarcă arată un schelet care sclipește în loc de un text. Cu „Reduce mișcarea” din telefon, nimic din toate astea nu se mișcă.
- **Culorile telefonului** (Aspect, Android 12+): accentul aplicației se potrivește cu imaginea de fundal (Material You); tema închisă primește nuanțele deschise.
- **Widget nou: Săptămâna banilor** — ultimele 7 zile ca bare colorate (aceleași praguri ca în Calendarul banilor), totalul și comparația cu săptămâna dinainte; arată când datele sunt de altă zi și nu arată sume cu aplicația blocată.
- **Curățenie CSS dovedită**: 556 de declarații CSS care nu se vedeau niciodată (aceeași regulă, aceeași proprietate, acoperită mai târziu în același grup de foi) au ieșit: stilurile scad de la 951 la 931 KB și de la 3241 la 3215 `!important`, cu ecranele nou adăugate incluse. Dovada: stilul calculat al fiecărui element, plus ::before/::after, e identic înainte și după pe 163 de stări (34 de ecrane × 3 teme, plus tabletă, desktop și modul simplu). Un test nou (`css-shadow.test.ts`) nu lasă declarațiile umbrite să se adune din nou, iar plafoanele de mărime și de `!important` coboară la noile valori.

## 1.1.141

Mai complex, mai frumos, mai modern — patru lucruri noi în Mai mult → Planificare:
- **Povestea anului**, refăcută: ecranele merg singure, ca o poveste (ținut apăsat = pauză), se poate glisa, cifrele „numără” când apar. Ecrane noi: anul lună cu lună (barele cheltuielilor, linia veniturilor, cea mai bună lună luminată), cea mai mare cheltuială, pașii mari (cât s-a dat pe datorii, obiectivele atinse), averea familiei față de acum un an și „personalitatea” familiei (Economisitorii, Luptătorii, Constanții, Minimaliștii, Fidelii, Exploratorii), aleasă după ce iese în evidență în cifre. Se deschide oricând din Planificare, nu doar în decembrie–ianuarie.
- **Tendințe și obiceiuri**: anul pe luni, ce categorii cresc și ce scad (ultimele 3 luni față de cele 3 dinainte, doar schimbările simțite în lei), ziua cea mai scumpă a săptămânii și cât merge pe weekend, fiecare categorie cu linia ei pe 12 luni, magazinele de bază (vizite, bonul mediu), abonamentele pe an și plățile care se repetă fără să fie urmărite (cu „Urmărește” le treceți la scadențe), cele mai mari cheltuieli.
- **Calendarul banilor**: luna ca o hartă de culori — fiecare zi trecută după cât s-a cheltuit, cu praguri luate din obiceiurile familiei; zilele care vin arată facturile, ratele, salariile și soldul estimat (cu traiul obișnuit inclus). Atingeți o zi pentru tot ce s-a întâmplat sau urmează; săptămânile lunii, cu ce mai e de plătit în cele care vin.
- **Simulator de investiții și pensie**: dobândă compusă lună de lună în trei scenarii (prudent, mediu, optimist), cu comision, inflație („în bani de azi”) și depunere care crește în fiecare an; cât să puneți lunar pentru o țintă; pentru pensie — golul față de pensia de stat, capitalul necesar, depunerea lunară și până la ce vârstă ajung banii. Simulare educativă, nu recomandare.
- Pe Astăzi, butonul de ascuns alertele de plic are mărimea corectă și pe ecrane înguste.

## 1.1.140

Planificare (Mai mult → Planificare), patru unelte noi:
- **Planul pe 12 luni**: lună cu lună, de la banii de azi — venitul din plan, traiul obișnuit (media ultimelor luni, fără facturi și rate), facturile care se repetă (lunar, trimestrial, anual, fiecare în luna ei), ratele cu dobândă până la ultima, obiectivele până se ating și evenimentele din calendar. Grafic cu barele lunii și linia banilor; luna în care banii nu mai ajung, scrisă sus. Scenarii „ce-ar fi dacă”: pierd un venit (câteva luni), o cheltuială lunară nouă, o cheltuială mare o dată, un credit nou — cu linia de dinainte, punctată, pentru comparație. Fiecare lună se desface pe venit, trai, facturi, rate, obiective, evenimente și scenarii.
- **Averea familiei**: banii din toate sursele plus bunurile trecute de mână (locuință, mașină, investiții), minus datoriile. Istoricul pe 12 luni e refăcut din mișcările deja notate, cu „+X față de acum un an”. Bunurile se sincronizează cu familia.
- **Ieșirea din datorii**: suma în plus pe lună, avalanșa față de bulgărele de zăpadă, data în care sunteți liberi, luni câștigate și dobânda economisită față de „doar rata”, ordinea datoriilor și calendarul plăților pe 6 luni.
- **Raportul lunii**: la început de lună (și card pe Astăzi în primele 7 zile), luna trecută — intrat, ieșit, rămas, rata de economisire, categoriile față de media celor 3 luni dinainte, ce a mers, ce e de urmărit și cel mult trei recomandări cu sume (o limită realistă, cât să mutați în fondul de urgență, un plic de coborât, abonamentele). „Închide luna” îl trece în istoric. Luni urmărite doar parțial sunt marcate ca orientative.
- „Ce e nou” arată planificarea.

## 1.1.139

Mai profesional:
- Astăzi, „Ultimele mișcări”: cheltuielile sunt negre, nu roșii — ca în Mișcări. Roșul rămâne doar pentru ce e depășit.
- Antetele de pagină (de ex. „Mai mult”) nu mai au cercul decorativ albăstrui; Obligații nu mai are o pată roșiatică în colț.
- Jos în Mai mult: versiunea aplicației, Confidențialitate, Termeni și Suport, ca în aplicațiile serioase.
- Versiunea internă (`APP_VERSION_CODE`) rămăsese la 124; acum e la zi, iar un test nou verifică la fiecare versiune că aplicația, package.json și build.gradle spun același lucru.
- Bulele zilelor din Astăzi arată sumele în formatul aplicației.

## 1.1.138

Mai frumos, fără funcții noi:
- Bara de sus în tema Alb: căutarea, meniul și asistentul sunt pictograme curate, fără chenar și umbră, ca în tema Întunecat.
- Astăzi: dispare golul de sub cifra zilei (rămăsese locul butonului „Notează”, care pe telefon stă în bara de jos).
- Toate linkurile („Detalii”, „Adaugă notiță…”, „Toate mișcările”) sunt în verdele aplicației, nu în albastru; „+ Adaugă notiță” stă pe un singur rând.
- Plicuri: „Fixe / Variabile / Economii” sunt etichete mici, ca restul titlurilor de secțiune, nu titluri mari gri.
- Mișcări: „Toate / Comune / Personale” are același stil liniștit ca „Toate / Ieșiri / Intrări”.
- Alertele de plic („Se termină înainte de salariu”) și „Provocarea lunii” au titlul mic și colorat, cum fusese gândit (o regulă globală pentru paragrafe le mărea).
- „Îmi permit…?” nu mai are săgeata de meniu; săgeata rămâne doar la butoanele care chiar se desfac.

## 1.1.137

Verificare generală după valurile 1.1.132–1.1.136:
- Viteză: asistentul de sfârșit de lună (și fișierul lui) se încarcă doar în ultimele 5 zile dinainte de salariu. Pornirea până la cifra zilei, pe un telefon lent simulat (CPU ×4): ~0,95 s, cât era înainte de valuri (~0,98 s). Pachetul principal: +8,5 KB față de 1.1.131.
- Notează în vacanță: o plată din șablon (chiria, rata) nu mai intră din oficiu în bugetul vacanței.
- Fondul de urgență nu mai ia drept fond un obiectiv cu „rezervare” în nume.
- Intrarea animată de pe Astăzi apare o dată pe zi, nu la fiecare repornire a aplicației.
- Butoane mai ușor de atins: „Ascunde alerta” pe ecrane înguste și sumele recente din Notează pe ecran lat.
- Toate ecranele verificate la 320, 390, 768 și 1280 px, în temele Alb, Întunecat și Navy, în română și engleză.

## 1.1.136

- Astăzi, pornire nouă: „Bună dimineața, Andrei” (după oră și pe numele de pe telefon) și fraza zilei, aleasă din ce contează azi — salariul de azi, vacanța în curs, ultimele zile dinainte de salariu, seria de notat, cum a fost ieri față de o zi obișnuită; altfel, un sfat scurt care se schimbă zilnic.
- La prima deschidere din zi, cardurile intră pe rând și cifra zilei urcă de la 0 (fără animație cu „mișcare redusă”).
- Scrisoare pentru viitor: în formularul obiectivului, un mesaj pentru voi, care rămâne ascuns până când atingeți ținta și apare atunci în felicitare.
- „Ce e nou” arată noutățile, cu scrisoarea și salutul în față.
- Plafonul CSS: 951 KB (+1 KB, salutul și intrarea animată).

## 1.1.135

- „Îmi permit…?” (pe Astăzi, lângă cifra zilei): scrii suma și răspunsul se schimbă pe loc — verde „Da”, galben „încape, dar strâmt”, roșu „nu acum, ar lipsi X”. Poți alege plicul (se socotește tranșa săptămânii) sau banii liberi; arată și câte săptămâni de economii pentru primul obiectiv ar însemna suma. „Am cumpărat — notează” deschide Notează.
- Viitorul banilor (Obiective): un glisor „cât puneți deoparte pe lună” și curba economiilor pe 3 ani, cu steaguri în luna în care se atinge fiecare obiectiv (întâi cele cu termen) și cât mai devreme ați ajunge cu 100 de lei în plus.
- „Ce e nou” arată noutățile ultimelor trei versiuni.

## 1.1.134

- Banii mărunți (Analiză): sumele mici care se repetă (cafeaua, covrigii) din ultimele 30 de zile, de câte ori și cât fac pe un an, cu cât ar însemna jumătate pentru primul obiectiv.
- Obiectiv atins: când un obiectiv de economisire ajunge la țintă, apare o felicitare cu confetti (fără animație dacă telefonul cere mișcare redusă) și „Spune familiei”. O singură dată pe obiectiv; obiectivele deja atinse la actualizare nu sunt felicitate din nou.
- Notificare cu 5 zile înainte de salariu, seara: ce mai e de plătit și unde pot merge banii care rămân (se oprește din Setări, la „Rezumate”).
- În Mișcări, cheltuielile din vacanță au „✈ numele vacanței” lângă categorie.
- Familia exemplu are câteva cafele și covrigi, ca „Banii mărunți” să se vadă din prima.

## 1.1.133

- Mod vacanță (Mai mult → Vacanță): o călătorie cu bugetul ei, cu prima și ultima zi și, opțional, o monedă (EUR, BGN…) în care se arată ce a rămas. Cât ține, Notează pune cheltuielile în bugetul vacanței, nu în plicurile lunii (chipul „Din bugetul vacanței” le poate scoate). Pe Astăzi: cât mai e și pe zi; la final, rezumatul. Se sincronizează cu familia.
- Coșul estimat: lista de cumpărături arată cât va costa, după prețurile de pe bonurile voastre din ultimele 120 de zile, unde a fost mai ieftin fiecare produs și magazinul în care tot coșul iese mai ieftin.
- Fond de urgență (Obligații): câte luni ați rezista fără venit, ținta de 3 luni de cheltuieli și cât să puneți deoparte lunar; „Începe fondul de urgență” creează obiectivul.
- Asistentul de sfârșit de lună: cu 5 zile înainte de salariu, Astăzi arată ce mai e de plătit, cât mai e în plicuri și pe zi și propune ca jumătate din ce va rămâne să meargă în fondul de urgență sau în primul obiectiv.
- Familia exemplu are acum bonuri cu produse și o listă de cumpărături. Butoanele bonurilor fără fotografie au nume pentru cititoarele de ecran; două texte din Prețuri sunt traduse în engleză.

## 1.1.132

- Scurtături pe iconiță: ții apăsat pe iconița aplicației → „Notează o cheltuială”, „Spune ce ai cumpărat”, „Lista de cumpărături”.
- Harta lunii în Mișcări: fiecare zi a lunii colorată după cât s-a cheltuit; atingi o zi și vezi doar mișcările ei.
- Textul mărit din setările telefonului se vede și în aplicație (între 85% și 130%, ca nimic să nu iasă din ecran). Butoanele mici (obiective, catalog) au acum cel puțin 40 px.
- „Ce e nou” arată noutățile ultimelor versiuni: voce, lista de cumpărături, widget, abonamente, PDF, pușculița copilului.

## 1.1.131

- Abonamente (Obligații): cât costă pe lună și pe an toate plățile care se repetă, ce s-a scumpit și abonamentele găsite în mișcări, cu „Adaugă” sau „Nu e abonament”.
- Raportul lunar PDF refăcut: cu diacritice, în limba aplicației, cu intrat / ieșit / rămas, inelul categoriilor față de luna trecută, plicurile ciclului, abonamentele și mișcările lunii. Exportul CSV are antetul în limba aplicației.
- Pușculița copilului: pe telefonul copilului, un obiectiv cu desen, un borcan care se umple și „+5 / +10 / +20 lei”.

## 1.1.130

- Verificare înainte de lansare: toate ecranele și instrumentele, în română și engleză, cu familia exemplu și fără date, pe telefoane mici, normale și tablete — fără erori și fără ecrane care ies din lățime.
- În engleză: Aspectul (teme și fundaluri), familia exemplu și câteva nume de categorii rămăseseră în română; acum sunt traduse.
- `docs/TEST-PE-TELEFON.md`: lista de verificat pe un telefon real (voce, widgeturi, notificări, lista de cumpărături pe două telefoane).

## 1.1.129

- Lista de cumpărături a familiei (Mai mult → Cumpărături, și pe Astăzi când are produse): mai multe deodată, prin virgulă; bifă în magazin; „Am terminat — notează plata” scoate ce s-a luat și deschide Notează pe Alimente. Se sincronizează cu partenerul.
- Tabletă și ecran lat (de la 900 px): pe Astăzi, cifra zilei stă în stânga, iar alertele, plicurile și mișcările în dreapta.
- Capturi Play noi (telefon RO/EN, tabletă RO): notarea din voce, lista de cumpărături, „Anul vostru”, pulsul lunii în Mișcări.

## 1.1.128

- Obligații: sus, cât e de plătit în următoarele 30 de zile și o bandă cu scadențele (întârzierile marcate); la fiecare datorie, luna în care scapi de ea; obiectivele au un cerc de progres; ghidul a coborât la final.
- Notificări pe tipuri, din Setări → Mementouri: scadențe, plicuri și ritm, venit, obiective, bilanțuri, amintirea de seară — fiecare se poate opri. Ora amintirii de seară se alege (18–22). Cu o serie de 3+ zile notate, amintirea spune „Nu pierde seria”.
- Setări: căutare („backup”, „card”, „notificări”) și grupuri cu o descriere scurtă; limba, modul simplu și doar offline stau într-un grup.

## 1.1.127

- Notare din voce: în Notează, „Spune ce ai cumpărat” — „cincizeci de lei la Lidl” completează suma, magazinul, categoria și plicul; omul verifică și apasă Gata. Pe Android prin recunoașterea vocală a telefonului, fără permisiunea microfonului.
- „Anul vostru”: retrospectiva anului ca poveste (zile notate, seria, unde s-au dus banii, magazinul de bază, cea mai bună lună, zile fără cheltuieli) și o imagine de trimis, implicit fără sume. În Analiză → Gospodărie și, din decembrie până în ianuarie, pe Astăzi.
- Mișcări: pulsul lunii (cât a ieșit, bară pe categorii, față de luna trecută până azi); categoriile filtrează lista; zilele se citesc „Ieri”, „Miercuri, 30 septembrie”.
- Notează: plicul și o bară cu ce rămâne după plată stau imediat sub categorie; categoriile proprii folosite recent intră în șirul de butoane.
- CSS: selectorii temei retrase „ink” simplificați (fără schimbare vizuală).

## 1.1.126

- Plicuri, refăcute: sus, o bară colorată cu împărțirea banilor pe plicuri și primele patru procente; fiecare plic are inelul lui de progres cu iconița categoriei; importul de plan a coborât sub listă.
- Analiză: diagrama cu categoriile e prima; controlul de perioadă stă pe două coloane pe telefon.
- Mod demo la prima pornire: „Vezi întâi cu o familie exemplu” umple aplicația cu familia Popescu (date relative la azi). Cât ține exemplul, sincronizarea e oprită; „Încep cu datele mele” golește tot și deschide pornirea.
- Abonamentul Familia: textele și documentele de billing aliniate cu codul (Casa: plicuri nelimitate, 2 persoane, un telefon; probă 30 de zile).
- Widget Android nou, „Plicurile mele”: cele mai folosite trei plicuri, cu bară și cât a rămas, plus buton de notare. Ascuns cu blocarea aplicației sau în modul membru.
- CSS mai mic: reguli pentru clase care nu mai există, scoase (933 KB, 3241 `!important`).

## 1.1.125

- Astăzi, refăcut: cifra zilei e prima, avertizările vin sub ea; eticheta stă pe rândul datei; un rând mereu vizibil cu zilele până la salariu, intrat și ieșit.
- „Plicurile tale” pe Astăzi: carduri care derulează, cu inel de progres în culoarea categoriei și cât a rămas.
- „Față de săptămâna trecută” și „Obiectiv și unde stau banii” sunt pastile mici, nu butoane pe toată lățimea.
- Provocarea lunii: în primele 10 zile, o țintă propusă pentru categoria flexibilă cea mai mare de luna trecută; acceptată, arată progresul și unde ajunge luna.
- „Notat” arată seria de la 3 zile la rând; Astăzi numără zilele fără cheltuieli din lună.
- Notificare pe 1 ale lunii, la 10: imaginea lunii trecute.
- Pagina de prezentare `despre.html` (GitHub Pages) și textele de lansare (`docs/lansare-texte.md`).

## 1.1.124

Aspect nou, cu culoare, și o buclă de creștere. Cercetarea din spate: [`cercetare-concurenta-2026-10.md`](cercetare-concurenta-2026-10.md).

- Fiecare categorie are culoarea ei (aceeași ca în diagrama din Analiză): iconițele din Mișcări, Astăzi și căutare, punctul și bara fiecărui plic.
- Notează: categoriile sunt la vedere, sub magazin, ca butoane colorate; înainte stăteau sub „Gata”, unde nu ajungea nimeni.
- Imaginea lunii (Analiză → Gospodărie, și pe Astăzi în primele 7 zile ale lunii): o poză 4:5 cu ce a rămas și unde s-au dus banii, de trimis pe WhatsApp sau Instagram. Implicit doar procente; sumele doar la cerere. Se face pe telefon.
- Tema Alb e mai luminoasă (carduri albe), iar cardul „Poți folosi azi” are o lumină verde discretă.
- Mai mult: iconițele stau pe plăcuțe colorate, pe secțiuni; dungile colorate din stânga au ieșit.
- Primul ecran: o frază clară și trei promisiuni — fără parola băncii, fără reclame, datele stau pe telefon.
- Recenzia din Play se cere și după a zecea zi cu cheltuieli notate sau după ce trimiți imaginea lunii (tot o singură dată, după o săptămână).
- Linia dintre mișcări pe Navy nu mai pică verificarea de contrast.
- Capturile din magazin refăcute (RO, EN, tabletă), cu imaginea lunii pe locul 3; datele lor (`seed.mjs`) sunt acum în repo.

## 1.1.96

- Import de extras mult mai deștept: titlul e numele magazinului („Plata la POS non-BT … LIDL DISCOUNT 0123 BUCURESTI RO” → „Lidl”), categoria e cea aleasă data trecută la același magazin, Raiffeisen și antetul real BT recunoscute, rândurile de detalii ING lipite de mișcare, date cu luna în litere, fișiere Windows-1250 (ș, ț).
- Extrase în Excel (.xlsx) și „.xls” care e de fapt HTML, citite pe telefon fără bibliotecă nouă; .xls vechi primește un mesaj clar.
- Abonamente: scumpirile se văd („Netflix: 49,99 → 59,99 RON”), și la scadențele urmărite („Folosește 59,99 RON”); costul lor pe lună și pe an. Benzina și repetițiile întâmplătoare nu mai par abonamente.
- Raportul lunii pentru familie (Analiză → Gospodărie): luna trecută / luna aceasta, unde s-au dus banii față de luna trecută, „Trimite raportul familiei” (text pentru WhatsApp).
- Aceeași formă a sumelor peste tot: „184,50 RON”, nu rotunjit la leu.
- Luna din Analiză se alege în română; butoanele mici au cel puțin 24 px.
- „Există o versiune nouă a aplicației” cu buton Reîncarcă, pe web.
- Android: mementourile nu mai deschid setarea „Alarme și mementouri” pe Android 14; permisiunea de alarme exacte a fost scoasă (Play nu mai cere declarație pentru ea).
- Accesibilitate: zero probleme axe (WCAG 2.2 AA) pe 16 ecrane × 3 teme — etichete și „RON” mai lizibile, nume pentru câmpuri și butoane.
- Performanță (Lighthouse mobil): 87 → 93; sigla ca WebP de 2,4 KB, încărcată o singură dată.
- Versiunea în engleză nu mai are texte rămase în română; ecranul de eroare e mai liniștitor și ascunde detaliile tehnice.
- „Ce plătim lunar” (Plan): veniturile familiei cu ziua lor și cheltuielile știute, cu interval (300–400) și alegerea cât se rezervă (maximul, media sau minimul), lunar sau pe săptămână, din orice venit sau doar din al unuia. Când intră un salariu, Astăzi propune repartizarea: obligațiile întâi, apoi restul; mâncarea = suma pe săptămână × săptămânile reale ale ciclului (4 sau 5, fără virgule); ce nu încape așteaptă al doilea salariu, care completează doar ce lipsește. Tichetele de masă nu intră. „Aplică repartizarea” creează plicurile și se poate anula.
- Cheltuiala ajunge în plicul ei după ce scrii: „taxi”, „grădiniță”, „Enel” → Lumină, „Apa Nova” → Apă, „Bolt” → Taxi, „TBI” → Rate fără dobândă — și când plicurile au aceeași categorie. Merge la notare și la importul de extras.
- Plicul care se termină înainte de salariu: Astăzi și Plan spun ziua în care ajunge la zero și cât poți cheltui pe zi ca să țină.
- Obiectivele de economisire spun cât să pui deoparte pe lună (la timp pentru termen sau, fără termen, când ajungi), cu „Pune deoparte”.
- Widget nou pe Android, „Poți cheltui azi”: cifra zilei și zilele până la salariu, cu „+ Notează”. E separat de widgetul rapid (care rămâne fără sume) și spune când cifra nu mai e de azi.
- Funcțiile Firebase pe firebase-admin 14: zero vulnerabilități cunoscute.
- Teste automate noi: fluxurile de bază cap-coadă (notare, plic, rată, ștergere, ciclu, temă) și verificarea contrastului pe bannere și cu opacitate.

## 1.1.95

- Fiecare telefon are o identitate anonimă Firebase (fără cont, fără date personale). Sincronizarea merge și fără ea; regulile de etapa 2 (`firestore.auth.rules`) o vor cere, după ce toți testerii au 1.1.95. Vezi `docs/ANONYMOUS_AUTH.md`.
- Ghidul online și feedbackul numără cererile pe telefon, nu pe IP-ul rețelei mobile.
- „Spune-ne ce nu merge”: formular în aplicație pentru testarea închisă, cu coadă fără internet.
- CSS: 2.934 de `!important` scoase (8.344 → 5.410), fără nicio schimbare de stil calculat pe 154 de ecrane × teme verificate. Vezi `docs/CSS_IMPORTANT_CLEANUP.md`.
- Politica de confidențialitate, pagina de ștergere și răspunsurile Data safety descriu invitația, identitatea anonimă și feedbackul.
- Mișcări: rândul unei mișcări se vede întreg pe telefon (titlul dispărea, coșul acoperea suma); lista începe din primul ecran.
- Astăzi: când plicul săptămânii e gol, „0,00” are explicație și butonul „Pune bani în plic”; ghidul spune aceeași cifră ca Astăzi.
- Plan și Analiză mai aerisite; texte care se tăiau cu „…” se văd întregi; „Intrat / Ieșit” lizibile pe Întunecat și Navy.
- Analiză: „Ciclu salariu” spune ce lipsește și duce la setarea datei salariului.
- Aspect unitar: aceleași carduri, titluri și etichete pe toate ecranele; 1.685 de reguli CSS moarte scoase (CSS 1.153 → 927 KB).
- Ghidul online nu mai așteaptă un minut după un Gemini lent: trece la rezervă în cel mult ~33 s.
- Aspect: „Comută automat zi/noapte” nu mai e oprit tăcut de butonul „Aplică” (noaptea rămâneai pe Alb); butonul spune ce face, iar tema se schimbă singură la oră și cu aplicația deschisă.
- Test automat nou pentru interfață (11 ecrane × 3 teme × 2 lățimi: layout și contrast).

## 1.1.94

Corecturile din testarea cu utilizatori (24.09.2026).

- Ratele la datorii dinainte de salariu se scad din „Poți folosi azi”, din Plan și din răspunsul ghidului.
- Fiecare telefon notează pe membrul lui („Cine ești pe acest telefon?”); sincronizarea se reia singură la redeschidere, iar pe Astăzi apare un semn când e oprită.
- Camera familiei are ID și cheie aleatoare; partenerul intră cu invitație. Camerele vechi, cu parolă, se pot muta pe invitație.
- O singură regulă pentru cifra zilei; după cumpărăturile săptămânii scrie „De mâine: X lei/zi”, nu „0 pe zi”.
- Planul de familie nu mai pornește „peste limită”; plicurile propuse încap în banii scriși.
- Datoriile au dobândă, ordine de plată (avalanșă / minge de zăpadă), data în care scapi de ele și alertă cu 3 zile înainte de rată.
- Venit neregulat: „vreau ca banii să-mi ajungă N zile”; încasări în EUR/USD/GBP.
- Scadențe trimestriale și anuale, sume variabile confirmate la plată; o scadență din categoria unui plic nu mai e rezervată de două ori.
- „Notat · Anulează” după o mișcare nouă; confirmările folosesc dialogul aplicației.
- „Azi” se socotește în fusul orar al familiei; datele se completează cu puncte; sumele „1e5” sau „1,500.50” sunt citite corect.
- Mod simplu oferit în onboarding; text lizibil pe cardul „Scadențe controlate”; „Înapoi” din Scadențe duce în Obligații.
- Abonamentul Familia: cumpărare, verificare pe server, restaurare și notificări Play — pregătite, pornite când `BILLING_LIVE = true`.

## 1.1.93

- Importul nefolosit care oprea publicarea (1.1.91 și 1.1.92) a ieșit, deci site-ul poate pleca de pe 1.1.90.
- Ghidul, la „cât pot cheltui azi”, spune cifra mare de pe Astăzi. „Nerepartizat” e aceeași sumă ca în Plan, nu o prognoză de ritm.

## 1.1.92

- Zilele unei tranșe nu se mai scurtează cu o zi când perioada trece peste ora de vară (Auckland, și România la sfârșit de octombrie).
- CI rulează testele și pe fusul `Pacific/Auckland`.
- Numărul de `!important` nu mai are voie să crească peste 8.344.
- Pluginurile de șablon Manus au ieșit din `vite.config.ts`.
- Notele vechi de cercetare stau în [archive/](archive/).

## 1.1.91

- Cele șase texte „Pregătim…” au traducere, deci publicarea pe site nu se mai oprește.
- Banda de zile urmează tranșa (de exemplu miercuri–marți), iar textul spune ziua reală de sfârșit.
- Cifrele de pe Astăzi păstrează banii, nu se mai rotunjesc la leu.

## 1.1.90

- Pe Android, aplicația nu mai ține o a doua copie în cache-ul WebView. Registrul, pozele de bon și sincronizarea rămân.

## 1.1.89

- „Mai mult” nu mai descarcă Setările și Sync până nu le deschizi.
