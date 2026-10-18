# Acuratețea scanării bonurilor

Măsurat pe 18.10.2026. Reproducere: `pnpm test` (corpus text), `node e2e/offline-accuracy.mjs` (OCR în Chrome).

## AI (Gemini, rezervă Claude) — post-procesare `scanToPrefill`
Corpus etichetat de mână: 71 de bonuri (Lidl, Kaufland, Carrefour, Auchan, Profi, Penny, Mega Image, dm,
farmacii, benzinării; cântărite, reduceri multiple, SGR, plăți mixte, total lipsă, rând citit greșit).
Toate câmpurile verificate (total, dată, număr de rânduri, reducere, avertizare, titlu, suma rândurilor): **100%**.

## Offline (Tesseract pe telefon + reguli)
| Set | Bonuri | Total exact | Total = suma rândurilor (gata de salvat) |
|---|---|---|---|
| Sintetic curat | 8 | 8 | 8 |
| Sintetic decolorat | 8 | 8 | 8 |
| Sintetic strâmb 3–5° | 8 | 8 | 7 |
| Sintetic încrețit/zgomot | 8 | 7 | 6 |
| Sintetic, bon lung în 2 poze | 8 | 8 | 8 |
| Poze reale (e2e/receipts) | 5 | 2 | 0 |

Înainte de această rundă: sintetic 19/40 total, 10/40 potrivire. Schimbări: niveluri întinse + prag adaptiv
la a doua încercare, reîncercare culcat pentru bucățile de bon, lipire fuzzy a capturilor, împăcarea cu
totalul (cantitate × preț vs. suma tipărită), corectarea regulilor care ascundeau produse („STREPSILS” ≈ „str.”).
Niciun bon greșit nu trece fără avertizare (0 din 45). Pozele reale rămân grele pentru Tesseract: AI-ul
rămâne calea recomandată; offline e rezerva gratuită, marcată „Citit pe telefon”.
