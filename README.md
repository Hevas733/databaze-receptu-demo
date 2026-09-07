# Databáze receptů

PWA pro správu receptur a jídelních lístků. Obsahuje databázi 45 receptur, vyhledávání a filtry, detail a editor norem, import receptur z DOCX, import jídelních lístků z CYGNUSU a přehled naimportovaných jídelníčků.

GitHub Pages zveřejňuje soubory z větve main. Úpravy a importy provedené na webové verzi se ukládají pouze v daném prohlížeči; samy nemění veřejné receptury ani obsah GitHubu. Část receptur čeká na doplnění a ověření. Obrázky jsou ilustrační.

Repozitář obsahuje webové rozhraní, receptury a zdrojový kód místního serveru. Zálohy, individuální náhrady jídel (`menu-replacements.json`) a původní DOCX podklady se nepublikují.

## Verze v90 — jídelníček a náhrady jídel

- Týdenní segmenty od pondělí do neděle, dny po načtení sbalené.
- Cena a nutriční součty dne na osobu zůstávají viditelné v hlavičce. Chybějící hodnoty jsou označené jako neúplné součty.
- Výběr náhradního jídla přes stávající databázi se všemi jejími filtry.
- Místní server ukládá náhrady samostatně na disk se zálohou a kontrolou souběžných změn. Původní import zůstává dohledatelný.
- GitHub Pages ukládá náhrady pouze do prohlížeče; neprovádí zápis na disk počítače ani do GitHubu.

Kontroly: `python -m unittest discover -s tests`, `node tests/menu-ui.test.cjs`, `node tests/builtin-storage.test.cjs`.
