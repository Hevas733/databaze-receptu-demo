# Databáze receptů — prezentační verze v152

[Otevřít prezentaci](https://hevas733.github.io/databaze-receptu-demo/)

PWA pro správu norem a jídelních lístků. Snímek aktuálních dat z 4. října 2026 včetně lednového a rozpracovaného únorového jídelníčku.

## Aktuální funkce

- Databáze norem s obrázky, alternativními názvy a filtrem aktivních/neaktivních norem.
- Oddělený import norem a jídelníčků. Jednoznačné shody se ukládají automaticky; nejasnosti vyžadují ruční kontrolu.
- Denní a týdenní finanční i nutriční součty s porovnáním s nastavenými referenčními hodnotami.
- Cena a nutriční hodnoty u jednotlivých jídel, nenápadné označení chybějících údajů.
- Detail, úprava a náhrada normy v dialogu nad jídelníčkem.

## Ukládání a omezení prezentace

GitHub Pages je statický web: úpravy, náhrady a importy se ukládají pouze do daného prohlížeče. Nemění zdrojová data na GitHubu ani místní provozní databázi. Publikované jídelníčky a známá přiřazení slouží jako výchozí snímek pro prohlížeč. Pro předvedení původního snímku použijte soukromé okno.

Část norem čeká na doplnění a ověření. Obrázky jsou ilustrační. Barevné porovnání živin není klinické hodnocení vhodnosti stravy.

Místní provoz používá `disk-storage-server.py` a zapisuje do souborů se zálohou. Repo obsahuje i zdrojový kód serveru, ale zálohy, individuální náhrady jídel, migrační stav prohlížečů a původní DOCX/obrazové podklady se nepublikují.

Změny ve větvi `main` publikuje workflow `.github/workflows/pages.yml`. Kontrola statické prezentace: `node tests/pages-smoke.test.cjs` (vyžaduje Playwright a Edge; cestu k Playwright lze zadat proměnnou `PLAYWRIGHT_MODULE`).
