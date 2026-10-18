# Siguranța datelor (Data Safety) — răspunsuri pentru BonAI 2.1.0

Play Console → Conținutul aplicației → Siguranța datelor.

## Întrebări generale
- Aplicația colectează sau partajează tipuri de date obligatorii? **Da**
- Toate datele colectate sunt criptate în tranzit? **Da** (HTTPS/TLS)
- Oferiți o modalitate de a solicita ștergerea datelor? **Da** — URL: https://balty1991.github.io/bonai/delete-data.html
- Conturi: aplicația **nu** creează conturi (identitate anonimă Firebase). La „Login” → *Aplicația nu permite crearea de conturi*.

## Tipuri de date (toate: **colectate**, **nepartajate** — Google, Anthropic, Groq, Sentry sunt furnizori de servicii/procesatori, deci nu „partajare”)

| Categorie Play | Tip | Prelucrat efemer? | Obligatoriu / opțional | Scop |
|---|---|---|---|---|
| Fotografii și videoclipuri | Fotografii (poza bonului, doar la scanarea AI) | **Da** (nu se păstrează după citire) | Opțional (există scanare offline și introducere de mână) | Funcționalitatea aplicației |
| Informații financiare | Istoricul achizițiilor (bonuri, produse, prețuri; trimise la citirea AI, la asistent și, criptat cap-coadă, la sincronizarea familiei) | Nu (sincronizarea păstrează pachetul criptat) | Opțional | Funcționalitatea aplicației |
| Informații personale | Nume (numele membrilor familiei, doar în pachetul criptat de sincronizare) | Nu | Opțional | Funcționalitatea aplicației |
| Informații personale | Adresă de e-mail (doar dacă o scrii în formularul de feedback) | Nu | Opțional | Asistență pentru clienți |
| Activitatea în aplicație | Alt conținut generat de utilizatori (mesajele de feedback) | Nu | Opțional | Asistență pentru clienți |
| Informații și performanță aplicație | Jurnale de erori + Diagnosticare (Sentry, UE, fără date personale) | Nu | Opțional (se oprește din Setări) | Analiză (stabilitate) |
| ID-uri dispozitiv sau alte ID-uri | ID anonim Firebase + App Check | Nu | **Obligatoriu** pentru funcțiile online | Funcționalitatea aplicației; Prevenirea fraudei, securitate și conformitate |

**Nu** se colectează: locație, contacte, mesaje, audio, calendar, fișiere, sănătate, istoric web, aplicații instalate, ID de publicitate, date de plată (plata, când va porni, e procesată de Google Play).

Note:
- Codurile de bare (doar cifrele) trimise la Open Food Facts/Wikidata nu sunt date despre utilizator.
- Monitorul Prețurilor (oprit implicit): trimite numele produsului și orașul, fără identificatori — nu e dată personală.
- Textul din descrierea Play („🔒 Confidențialitate”) spune exact aceleași lucruri; dacă schimbi aici, schimbă și acolo.
