-- De zeven persoonlijke afwijkingen omgezet naar de v2-vorm. Met de hand, net als
-- de afdelingen in 20260920g.
--
-- DESKTOP is een letterlijke overname van `rechten_override`; `houtrotherstel`
-- valt weg en de schakelaars worden functies.
--
-- MOBIEL bevat alleen de onderdelen die op /m bestaan. Wie iets toekent, houdt
-- dat ook op zijn telefoon; wie iets afneemt, neemt het op /m alleen af als het
-- daar vandaag ook echt gecontroleerd wordt. Dat is nu uitsluitend
-- `materieelbeheer`. Een null op kam of dossiers zou op /m iets wegnemen dat die
-- persoon vandaag gewoon kan openen, en dat is geen migratie maar een
-- beleidswijziging — die hoort in het beheerscherm te gebeuren, niet hier.

update public.medewerkers set rechten = '{
  "versie": 2,
  "desktop": {
    "modules": {
      "taken": "beheren", "toolbox": "beheren", "mijn_taken": "beheren",
      "formulieren": "beheren"
    },
    "functies": { "mijn_taken.alle_zien": true }
  },
  "mobiel": {
    "modules": { "toolbox": "beheren", "mijn_taken": "beheren" },
    "functies": { "mijn_taken.alle_zien": true }
  }
}'::jsonb where email = 'chris@everts.chat';

-- Faried neemt juist rechten AF. Op mobiel gaat alleen materieelbeheer mee als
-- null: dat is het enige dat /m vandaag controleert, dus hij ziet de
-- Materieel-tegel nu ook niet. Zijn null op kam wordt op mobiel 'lezen', want
-- /m/kwaliteit staat vandaag voor iedereen open.
update public.medewerkers set rechten = '{
  "versie": 2,
  "desktop": {
    "modules": {
      "kam": null, "dossiers": "lezen", "planning": null, "relaties": "lezen",
      "wagenpark": null, "medewerkers": null, "servicedesk": null,
      "inkoopfacturen": null, "materieelbeheer": null
    },
    "functies": {}
  },
  "mobiel": {
    "modules": { "dossiers": "lezen", "kam": "lezen", "materieelbeheer": null },
    "functies": {}
  }
}'::jsonb where email = 'faried@everts.chat';

update public.medewerkers set rechten = '{
  "versie": 2,
  "desktop": {
    "modules": {
      "taken": "schrijven", "toolbox": "schrijven", "mijn_taken": "beheren",
      "everts_calc": "beheren", "formulieren": "schrijven",
      "objectenbeheer": "beheren"
    },
    "functies": {}
  },
  "mobiel": {
    "modules": {
      "toolbox": "schrijven", "mijn_taken": "beheren", "everts_calc": "beheren"
    },
    "functies": {}
  }
}'::jsonb where email = 'gerben@everts.chat';

update public.medewerkers set rechten = '{
  "versie": 2,
  "desktop": {
    "modules": { "financieel": "schrijven", "mijn_taken": "beheren" },
    "functies": {}
  },
  "mobiel": {
    "modules": { "mijn_taken": "beheren" },
    "functies": {}
  }
}'::jsonb where email = 'joy@everts.chat';

update public.medewerkers set rechten = '{
  "versie": 2,
  "desktop": {
    "modules": {
      "toolbox": "beheren", "mijn_taken": "beheren", "objectenbeheer": "beheren"
    },
    "functies": {}
  },
  "mobiel": {
    "modules": { "toolbox": "beheren", "mijn_taken": "beheren" },
    "functies": {}
  }
}'::jsonb where email = 'marco@everts.chat';

-- De grootste override: twintig sleutels, waaronder twee schakelaars. Dit is de
-- afwijking die de schrale afdelingsstandaard van Ondersteunend compenseert.
update public.medewerkers set rechten = '{
  "versie": 2,
  "desktop": {
    "modules": {
      "kam": "schrijven", "toolbox": "schrijven", "dossiers": "schrijven",
      "planning": "schrijven", "relaties": "schrijven", "wagenpark": "schrijven",
      "financieel": "schrijven", "mailintake": "schrijven",
      "mijn_taken": "schrijven", "everts_calc": "schrijven",
      "formulieren": "schrijven", "medewerkers": "schrijven",
      "servicedesk": "schrijven", "klantportaal": "schrijven",
      "inkoopfacturen": "schrijven", "objectenbeheer": "schrijven",
      "medewerkershandboek": "schrijven"
    },
    "functies": {
      "mijn_taken.alle_zien": true,
      "wagenpark.prive_ritten": true,
      "wagenpark.werktijden": true
    }
  },
  "mobiel": {
    "modules": {
      "kam": "schrijven", "toolbox": "schrijven", "dossiers": "schrijven",
      "mijn_taken": "schrijven", "everts_calc": "schrijven"
    },
    "functies": { "mijn_taken.alle_zien": true }
  }
}'::jsonb where email = 'marjolein@everts.chat';

update public.medewerkers set rechten = '{
  "versie": 2,
  "desktop": {
    "modules": {
      "kam": "schrijven", "taken": "schrijven", "toolbox": "schrijven",
      "dossiers": "schrijven", "planning": "schrijven", "relaties": "schrijven",
      "mijn_taken": "schrijven", "formulieren": "schrijven",
      "medewerkers": "schrijven", "servicedesk": "schrijven"
    },
    "functies": {}
  },
  "mobiel": {
    "modules": {
      "kam": "schrijven", "toolbox": "schrijven", "dossiers": "schrijven",
      "mijn_taken": "schrijven"
    },
    "functies": {}
  }
}'::jsonb where email = 'olga@everts.chat';
