# Ukládání norem

Spusťte SPUSTIT-APLIKACI.ps1. Každý místní DOCX import vytvoří Recepty/<název>/<název>.json, vlastní HTML detail, IMPORT.md a podklady s originálním DOCX. Názvy složek jsou bez diakritiky; při kolizi se připojí číslo. ID norem zůstávají zachována.

imported-index.json je pouze rejstřík cest. Obsah norem se načítá z jednotlivých JSON souborů. imported-norms.json je ponechaný původní katalog jako záloha migrace, aplikace jej už nepoužívá ani neaktualizuje. Předchozí verze měněných souborů ukládá místní server do .recipe-backups.

Na GitHub nahrajte aktuální webové soubory, imported-index.json a změněné složky Recepty. Samotný rejstřík nestačí. Nezveřejňujte .recipe-backups ani podklady, které nechcete zpřístupnit. Nové importy na GitHub Pages se neukládají do repozitáře: stáhněte zálohu, obnovte ji na místním PC a nahrajte soubory.

Pro ruční doplnění podkladů a obrázků použijte složku dané normy. Obrázek se bez nastavení odkazu v aplikaci automaticky nezobrazí. Automatický import nemění původní recepty.
