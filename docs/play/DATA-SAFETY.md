# Data Safety — schiță (de verificat de Alin înainte de trimitere)

| Tip de date (Play) | Colectat? | Partajat? | Scop | Opțional? |
|---|---|---|---|---|
| Fotografii (poza bonului) | Da, transmis temporar | Nu* | Funcționalitatea aplicației (citirea bonului) | Da |
| Istoric achiziții (bonuri, produse, prețuri) | Da | Nu | Funcționalitate, sincronizare familie | Da (sincronizarea) |
| Identificatori (ID cont Firebase anonim/Google) | Da | Nu | Autentificare sync, prevenire abuz | Da |
| Adresă email | Doar dacă te conectezi cu Google | Nu | Gestionare cont | Da |
| Locație precisă | Nu | — | — | — |
| Locație aproximativă (oraș de pe bon) | Doar ca text din bon, local | Nu | Comparare prețuri | Da |
| Diagnostic / crash | Nu (fără SDK de analytics) | — | — | — |

\* Poza bonului este trimisă către funcția Firebase `readReceipt`, care o transmite unui furnizor de model AI ca *procesator* pentru extragerea textului; nu este stocată după răspuns. În Play acesta NU se declară ca „partajare” (procesator în numele dezvoltatorului) — de confirmat cu termenii furnizorului.

**Securitate**
- Date criptate în tranzit: Da (HTTPS).
- Sincronizarea familiei: criptată cap-coadă (AES-GCM, cheie doar pe dispozitive).
- Utilizatorul poate cere ștergerea datelor: Da — ștergere locală din aplicație + ștergere grup familie; pagină web de ștergere necesară (pas manual).

**Monitorul Prețurilor** (oprit implicit): când e activ, telefonul trimite direct către monitorulpreturilor.info numele produsului și orașul; nu trimitem date personale.

## Pași manuali (Alin)
1. Play Console → Conținutul aplicației → Siguranța datelor: completează conform tabelului.
2. Publică politica de confidențialitate actualizată (Bonuț) și URL-ul de ștergere a contului.
3. Verifică termenii furnizorului AI (retenție zero / procesator).
