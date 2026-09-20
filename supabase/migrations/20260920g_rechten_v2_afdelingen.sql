-- De vier actieve afdelingen omgezet naar de v2-vorm. Met de hand geschreven en
-- niet generiek geconverteerd: het zijn vier rijen, en zo is in de review regel
-- voor regel te zien wat iedereen krijgt.
--
-- DESKTOP is een letterlijke overname van `standaard_rechten`, met twee
-- uitzonderingen:
--   * `houtrotherstel` gaat niet mee. Er is geen route, geen guard en geen
--     menu-item meer; houtrot is een dossiertabblad geworden.
--   * `wagenpark_prive` en `inkoopfacturen_alle` waren geen modules maar
--     schakelaars. Ze worden functies. `wagenpark_prive` deed twee dingen
--     tegelijk (privé-ritten én de Werktijden-pagina) en splitst in twee.
--
-- MOBIEL is nieuw. De regel: elke afdeling krijgt precies de zes onderdelen die
-- op /m bestaan, op zijn desktopniveau — en minimaal 'lezen' waar het scherm
-- vandaag zonder recht bereikbaar is. Zonder die ondergrens zou dossiers, kam,
-- everts_calc, toolbox of mijn_taken op iemands telefoon verdwijnen die er nu
-- gewoon in kan. Alleen `materieelbeheer` wordt op /m vandaag echt gecontroleerd
-- (app/m/page.tsx), dus dat neemt zijn desktopniveau over.
--
-- Wat op /m GEEN sleutel krijgt en dat ook niet hoort te krijgen: handboek
-- (lib/handboek/auth.ts — iedereen leest zijn eigen handboek, de
-- zichtbaarheidskenmerken bepalen wat), uren en uren/keuren
-- (app/m/uren/keuren/page.tsx:32 — dat routeert op je rol op het dossier, niet
-- op een recht), verlof, planning, profiel, notificaties, oplevering en bezoek.
-- Dat gaat allemaal over je eigen gegevens of je rol, niet over een module.

update public.medewerker_afdelingen set rechten = '{
  "versie": 2,
  "desktop": {
    "modules": {
      "dossiers": "lezen", "planning": "lezen", "management": "lezen",
      "medewerkers": "lezen", "materieelbeheer": "schrijven"
    },
    "functies": {}
  },
  "mobiel": {
    "modules": {
      "dossiers": "lezen", "kam": "lezen", "everts_calc": "lezen",
      "materieelbeheer": "schrijven", "toolbox": "lezen", "mijn_taken": "lezen"
    },
    "functies": {}
  }
}'::jsonb where naam = 'Uitvoering';

update public.medewerker_afdelingen set rechten = '{
  "versie": 2,
  "desktop": {
    "modules": { "inkoopfacturen": "lezen", "materieelbeheer": "schrijven" },
    "functies": {}
  },
  "mobiel": {
    "modules": {
      "dossiers": "lezen", "kam": "lezen", "everts_calc": "lezen",
      "materieelbeheer": "schrijven", "toolbox": "lezen", "mijn_taken": "lezen"
    },
    "functies": {}
  }
}'::jsonb where naam = 'Ondersteunend';

-- De vijf expliciete null-waarden blijven null: dat is "expliciet geen", niet
-- "niet ingevuld", en het verschil telt bij het samenvoegen met een override.
update public.medewerker_afdelingen set rechten = '{
  "versie": 2,
  "desktop": {
    "modules": {
      "kam": "schrijven", "taken": null, "dossiers": "beheren",
      "planning": "beheren", "relaties": "beheren", "wagenpark": "lezen",
      "financieel": null, "management": null, "everts_calc": "schrijven",
      "formulieren": null, "medewerkers": "beheren", "servicedesk": "beheren",
      "instellingen": null, "inkoopfacturen": "schrijven",
      "materieelbeheer": "beheren"
    },
    "functies": {}
  },
  "mobiel": {
    "modules": {
      "dossiers": "beheren", "kam": "schrijven", "everts_calc": "schrijven",
      "materieelbeheer": "beheren", "toolbox": "lezen", "mijn_taken": "lezen"
    },
    "functies": {}
  }
}'::jsonb where naam = 'Projectbureau';

update public.medewerker_afdelingen set rechten = '{
  "versie": 2,
  "desktop": {
    "modules": {
      "kam": "beheren", "taken": "beheren", "dossiers": "beheren",
      "planning": "beheren", "relaties": "beheren", "wagenpark": "beheren",
      "financieel": "beheren", "management": "beheren", "mijn_taken": "beheren",
      "everts_calc": "beheren", "formulieren": "beheren", "medewerkers": "beheren",
      "servicedesk": "beheren", "instellingen": "beheren",
      "inkoopfacturen": "beheren", "materieelbeheer": "beheren"
    },
    "functies": {
      "wagenpark.prive_ritten": true,
      "wagenpark.werktijden": true,
      "inkoopfacturen.zonder_project": true
    }
  },
  "mobiel": {
    "modules": {
      "dossiers": "beheren", "kam": "beheren", "everts_calc": "beheren",
      "materieelbeheer": "beheren", "toolbox": "lezen", "mijn_taken": "beheren"
    },
    "functies": {}
  }
}'::jsonb where naam = 'Directie';
