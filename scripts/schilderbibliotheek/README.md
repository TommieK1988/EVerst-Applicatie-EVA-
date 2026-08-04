# Schilderbibliotheek-import

Zet het Calc4You-bestand `Bibliotheek - Onderhoud..c4y` en het OnderhoudNL
Basisverf- en glasbestek 2020 om in een SQL-migratie voor de schilderbibliotheek.

## Model

De schilderbibliotheek (`schilder_*`) is de **bron**; de recepten-bibliotheek
(`paint_*`) is een **spiegel** die een database-trigger bijhoudt. Gespiegelde
recepten staan op `vergrendeld = true` en zijn in de recepten-bibliotheek
alleen-lezen — anders zouden de twee uit elkaar lopen.

```
schilder_onderdelen ─┬─ schilder_types ─┐
                     │                  ├─ schilder_combinaties ─┬─ schilder_arbeid_normen
schilder_behandelingen ──────────────────┘                       └─ schilder_materiaal_normen
                                                │
                                    trigger: spiegel_schilder_naar_recept
                                                ▼
                                  paint_items (vergrendeld) ─┬─ paint_labor_norms
                                                             └─ paint_material_norms
```

De sleutel is overal de Calc4You-code, niet de omschrijving: dezelfde code heet
per behandeling anders en bevat typefouten (`khB` = "kozijnen 10-20cm" /
"Kozijnen hout 10-20cm" / "Hout kozijnen 10-20cm"). Daarom `bron_code` op
`schilder_types` en `schilder_combinaties` — dat maakt de import ook idempotent.

## Draaien

```bash
# 1. Werkomschrijvingen uit het bestek halen (levert werkomschrijvingen.json).
#    Alleen nodig als het bestek wijzigt; het resultaat staat in de repo.
python scripts/schilderbibliotheek/extract-bestek.py "<pad>/OnderhoudNL Basisverf- en glasbestek 2020.pdf"

# 2. Controleren of de mappingtabel het bronbestand volledig dekt.
#    Faalt hard bij een gat — anders zouden er stilzwijgend regels verdwijnen.
node scripts/schilderbibliotheek/controleer-mapping.mjs "<pad>/Bibliotheek - Onderhoud..c4y"

# 3. Migratie + correctierapport genereren.
node scripts/schilderbibliotheek/genereer-migratie.mjs \
     "<pad>/Bibliotheek - Onderhoud..c4y" \
     supabase/migrations/<datum>_schilderbibliotheek_data.sql

# 4. Toepassen. Het bestand is ~190 KB en past niet als MCP-parameter,
#    dus dit gaat rechtstreeks via DATABASE_URL, in één transactie.
node scripts/schilderbibliotheek/voer-migratie-uit.mjs \
     supabase/migrations/<datum>_schilderbibliotheek_data.sql <naam>
```

Stap 4 vereist `node_modules` (voor `pg`). Draai je vanuit een git-worktree, dan
zoekt het script het pakket vanaf de werkmap omhoog — start hem dus vanuit de
hoofdcheckout, of maak een junction naar `node_modules`.

## Bestanden

| | |
|---|---|
| `mapping-onderdelen.mjs` | De enige handmatig gecureerde stap: 116 Calc4You-onderdeelcodes → (onderdeel, type, eenheid), plus de bekende bronfouten |
| `lees-c4y.mjs` | Leest de matrixgroepen OH/OK/OM/OS en past de correcties toe |
| `lees-staartkosten.mjs` | Leest BP/BB — samengestelde posten, ander model dan de matrix |
| `extract-bestek.py` | Werkstappen per behandeling uit de bestek-PDF |
| `werkomschrijvingen.json` | Resultaat daarvan; in de repo zodat de migratie zonder Python te draaien is |
| `controleer-mapping.mjs` | Zes controles vóór het genereren |
| `genereer-migratie.mjs` | Bouwt de SQL en het correctierapport |
| `voer-migratie-uit.mjs` | Voert een migratiebestand uit en boekt het in `schema_migrations` |
| `correctierapport.md` | Elke ingreep op de brondata, met aantallen |

## Wat er níét in zit

- **HR (houtrotherstel, 39 regels)** — die zitten al als `HR-*`-recepten in
  `paint_items` uit "Prijslijst houtschade 2025", met gesplitste materialen en
  een marge. Die versie is nieuwer en rijker dan het c4y-blok.
- **De opbouw van de materiaalprijs.** Calc4You geeft één samengesteld bedrag per
  eenheid; welke producten daarin zitten staat niet in het bestand. Er komt
  daarom één materiaalnorm per combinatie ("Materiaal (samengesteld)").
