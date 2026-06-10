-- =====================================================================
-- Relaties module v2: multi-type organisaties, contactpersonen,
-- particulieren en type-specifieke extensietabellen
-- =====================================================================

-- ─── 1. Evolve relaties.type → types text[] ───────────────────────────────────

-- Voeg nieuwe kolom toe naast de oude
ALTER TABLE public.relaties
  ADD COLUMN IF NOT EXISTS types text[] NOT NULL DEFAULT ARRAY[]::text[];

-- Backfill: 'klant' → 'opdrachtgever', rest identiek
UPDATE public.relaties
SET types = CASE type::text
  WHEN 'klant'         THEN ARRAY['opdrachtgever']
  WHEN 'leverancier'   THEN ARRAY['leverancier']
  WHEN 'onderaannemer' THEN ARRAY['onderaannemer']
  ELSE ARRAY[type::text]
END
WHERE types = ARRAY[]::text[];

-- Verwijder de unieke constraint die de old type kolom refereerde
ALTER TABLE public.relaties
  DROP CONSTRAINT IF EXISTS relaties_type_bouw7_id_key;

-- Verwijder de oude type kolom en enum
ALTER TABLE public.relaties DROP COLUMN IF EXISTS type;
DROP TYPE IF EXISTS relatie_type;

-- GIN index voor array-containment queries (WHERE types @> ARRAY['opdrachtgever'])
DROP INDEX IF EXISTS public.relaties_type_idx;
CREATE INDEX IF NOT EXISTS relaties_types_gin_idx
  ON public.relaties USING GIN (types);

-- Herstel bouw7 uniqueness zonder type-scope
CREATE UNIQUE INDEX IF NOT EXISTS relaties_bouw7_id_unique_idx
  ON public.relaties (bouw7_id)
  WHERE bouw7_id IS NOT NULL;

-- ─── 2. contactpersonen (zelfstandige entiteit) ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.contactpersonen (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  voornaam        text        NOT NULL,
  tussenvoegsel   text,
  achternaam      text        NOT NULL,
  email           text,
  telefoon        text,
  mobiel          text,
  linkedin_url    text,
  opmerkingen     text,
  actief          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid        REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS contactpersonen_achternaam_idx
  ON public.contactpersonen (achternaam);

CREATE TRIGGER tg_contactpersonen_updated_at
  BEFORE UPDATE ON public.contactpersonen
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

-- ─── 3. contactpersoon_organisaties (many-to-many junction) ──────────────────

CREATE TABLE IF NOT EXISTS public.contactpersoon_organisaties (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contactpersoon_id   uuid        NOT NULL REFERENCES public.contactpersonen(id)  ON DELETE CASCADE,
  organisatie_id      uuid        NOT NULL REFERENCES public.relaties(id)          ON DELETE CASCADE,
  functie             text,
  is_primair          boolean     NOT NULL DEFAULT false,
  opmerkingen         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contactpersoon_id, organisatie_id)
);

CREATE INDEX IF NOT EXISTS cp_org_organisatie_idx
  ON public.contactpersoon_organisaties (organisatie_id);
CREATE INDEX IF NOT EXISTS cp_org_contactpersoon_idx
  ON public.contactpersoon_organisaties (contactpersoon_id);

-- ─── 4. particulieren (B2C individuen) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.particulieren (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  voornaam        text        NOT NULL,
  tussenvoegsel   text,
  achternaam      text        NOT NULL,
  email           text,
  telefoon        text,
  mobiel          text,
  adres_straat    text,
  adres_postcode  text,
  adres_plaats    text,
  adres_land      text        DEFAULT 'Nederland',
  geboortedatum   date,
  opmerkingen     text,
  actief          boolean     NOT NULL DEFAULT true,
  bouw7_id        text,
  bouw7_sync_status text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid        REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS particulieren_achternaam_idx
  ON public.particulieren (achternaam);

CREATE TRIGGER tg_particulieren_updated_at
  BEFORE UPDATE ON public.particulieren
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

-- ─── 5. Bankgegevens (1:1, leverancier + onderaannemer) ──────────────────────

CREATE TABLE IF NOT EXISTS public.relatie_bankgegevens (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  relatie_id      uuid        NOT NULL UNIQUE REFERENCES public.relaties(id) ON DELETE CASCADE,
  iban            text,
  bic             text,
  tenaamstelling  text,
  opmerkingen     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER tg_relatie_bankgegevens_updated_at
  BEFORE UPDATE ON public.relatie_bankgegevens
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

-- ─── 6. Facturatie-instellingen (1:1, opdrachtgever) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.relatie_facturatie (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  relatie_id                uuid        NOT NULL UNIQUE REFERENCES public.relaties(id) ON DELETE CASCADE,
  betaaltermijn_dagen       integer     DEFAULT 30,
  facturatie_email          text,
  inkoopnummer_verplicht    boolean     NOT NULL DEFAULT false,
  kredietlimiet             numeric(12,2),
  opmerkingen               text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER tg_relatie_facturatie_updated_at
  BEFORE UPDATE ON public.relatie_facturatie
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

-- ─── 7. Inkoop-instellingen (1:1, leverancier + onderaannemer) ───────────────

CREATE TABLE IF NOT EXISTS public.relatie_inkoop (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  relatie_id                  uuid        NOT NULL UNIQUE REFERENCES public.relaties(id) ON DELETE CASCADE,
  leveranciernummer           text,
  standaard_levertijd_dagen   integer,
  minimumbestelling           numeric(12,2),
  opmerkingen                 text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER tg_relatie_inkoop_updated_at
  BEFORE UPDATE ON public.relatie_inkoop
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

-- ─── 8. Verkoop prijsafspraken (1:n, opdrachtgever) ──────────────────────────

CREATE TABLE IF NOT EXISTS public.relatie_verkoop_prijsafspraken (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  relatie_id      uuid        NOT NULL REFERENCES public.relaties(id) ON DELETE CASCADE,
  omschrijving    text        NOT NULL,
  eenheid         text,
  prijs           numeric(12,2),
  geldig_vanaf    date,
  geldig_tot      date,
  opmerkingen     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verkoop_prijsafspraken_relatie_idx
  ON public.relatie_verkoop_prijsafspraken (relatie_id);

CREATE TRIGGER tg_relatie_verkoop_prijsafspraken_updated_at
  BEFORE UPDATE ON public.relatie_verkoop_prijsafspraken
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

-- ─── 9. Inkoop kortingsafspraken (1:n, leverancier) ──────────────────────────

CREATE TABLE IF NOT EXISTS public.relatie_inkoop_kortingsafspraken (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  relatie_id      uuid        NOT NULL REFERENCES public.relaties(id) ON DELETE CASCADE,
  categorie       text,
  korting_pct     numeric(5,2),
  geldig_vanaf    date,
  geldig_tot      date,
  opmerkingen     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kortingsafspraken_relatie_idx
  ON public.relatie_inkoop_kortingsafspraken (relatie_id);

CREATE TRIGGER tg_relatie_inkoop_kortingsafspraken_updated_at
  BEFORE UPDATE ON public.relatie_inkoop_kortingsafspraken
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

-- ─── 10. Inkoop prijsafspraken (1:n, onderaannemer) ──────────────────────────

CREATE TABLE IF NOT EXISTS public.relatie_inkoop_prijsafspraken (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  relatie_id      uuid        NOT NULL REFERENCES public.relaties(id) ON DELETE CASCADE,
  omschrijving    text        NOT NULL,
  eenheid         text,
  prijs           numeric(12,2),
  geldig_vanaf    date,
  geldig_tot      date,
  opmerkingen     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inkoop_prijsafspraken_relatie_idx
  ON public.relatie_inkoop_prijsafspraken (relatie_id);

CREATE TRIGGER tg_relatie_inkoop_prijsafspraken_updated_at
  BEFORE UPDATE ON public.relatie_inkoop_prijsafspraken
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
