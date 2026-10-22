# Capturi de ecran pentru Play (telefon, 1080×1920, 9:16)

Se generează din aplicația de acum, cu o familie demo inventată (Andrei și Maria, Cluj-Napoca, 14 bonuri în trei luni de la Lidl, Kaufland, Profi și Mega Image), nu din date reale:

```
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node e2e/play-screens.mjs
```

Ies în `docs/play-store-assets/screenshots/ro/` și `en/`. Fiecare captură e făcută la 390 px (×2) și pusă într-un cadru violet, cu titlul deasupra. Titlurile spun doar ce face ecranul, fără promisiuni („economisești sigur”, „cel mai ieftin din oraș”). Se refac după orice schimbare vizibilă a ecranelor.

Ordinea contează: primele 3 apar în căutare.

1. **Acasă**: „Bonurile tale, lunile tale, clar” (luna din bonuri, ce ai economisit văzut pe bon și ce ai putea plăti mai puțin, ca estimare).
2. **Verifică bonul**: „Fotografiezi bonul. Citesc fiecare produs” (produsele cu prețul, comparate cu data trecută).
3. **Magazine**: „Unde coșul tău iese mai ieftin”.
4. **Lista**: „Lista familiei, cu prețurile plătite”.
5. **Produse**: „Prețul fiecărui produs, în timp”.
6. **În casă**: „Vezi ce ai în casă și ce se termină”.
7. **Ai economisit la cumpărături**: „Reducerile de pe bonuri, adunate pentru tine” (cu rândul că reducerile sunt ale magazinelor).
8. **Rapoarte**: „Unde se duc banii, lună de lună”.

Capturile vechi „Buget Familie” (salariu, plicuri, jurnal) au fost scoase: nu mai descriu aplicația.

Grafica recomandată (feature graphic, 1024×500): iconul BonAI și „Bonurile tale, prețuri reale”.
