# Incident — ecran alb GitHub Pages mobil

**Raportat la 27 august 2026, ora locală 15:48.** Browserul mobil afișează documentul paginii publice, dar zona aplicației rămâne complet albă.

**Cauză confirmată.** GitHub Pages servește proiectul la `/buget-familie/`, iar buildul publicat anterior a folosit baza implicită `/`. Documentul a cerut astfel `https://balty1991.github.io/assets/index-7gyRMs2E.js`, care răspundea 404; resursa corectă este `https://balty1991.github.io/bonai/assets/index-7gyRMs2E.js`. Fără modulul principal, `#root` a rămas gol.

**Remediere.** Configurația Vite folosește acum baza `/buget-familie/` numai pentru buildul Pages, iar comanda explicită `pnpm run build:pages` este utilizată atât local la publicare, cât și în workflow-ul GitHub. Buildul normal pentru dezvoltare și Android rămâne la baza `/`, deci căile resurselor din APK nu se modifică. Urmează verificarea publică după distribuirea bundle-ului corect.

**Verificare finală.** Bundle-ul corect a fost publicat pe `gh-pages` la commitul `7a61ce2`. Reîncărcarea publică cu `?v=2f891fb` a montat aplicația și controalele în `#root`; APK-ul GitHub Actions `33074085401` pentru commitul `2f891fb` s-a încheiat cu `success`. Remedierea nu citește, nu șterge și nu migrează `localStorage`.
