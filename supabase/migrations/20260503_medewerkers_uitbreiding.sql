-- Medewerkers uitbreiding: extra persoonsgegevens, bedrijfsmiddelen,
-- custom attributen, bestanden, handtekening, pauzeblokken en relatie-koppeling.

-- ── 1. Extra kolommen op medewerkers ─────────────────────────────────

ALTER TABLE medewerkers
  ADD COLUMN IF NOT EXISTS adres_straat          text,
  ADD COLUMN IF NOT EXISTS adres_postcode        text,
  ADD COLUMN IF NOT EXISTS adres_plaats          text,
  ADD COLUMN IF NOT EXISTS geboortedatum         date,
  ADD COLUMN IF NOT EXISTS bsn                   text,
  ADD COLUMN IF NOT EXISTS werkmaatschappij_id   uuid REFERENCES bedrijfsgegevens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS relatie_id            uuid REFERENCES relaties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handtekening_url      text;

-- ── 2. Pauzeblokken per roosterregel ─────────────────────────────────

CREATE TABLE IF NOT EXISTS medewerker_rooster_pauzes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rooster_id  uuid NOT NULL REFERENCES medewerker_roosters(id) ON DELETE CASCADE,
  pauze_start time NOT NULL,
  pauze_eind  time NOT NULL,
  CONSTRAINT pauze_eind_na_start CHECK (pauze_eind > pauze_start),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rooster_pauzes_rooster_idx ON medewerker_rooster_pauzes(rooster_id);

-- ── 3. Bedrijfsmiddelen ───────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE bedrijfsmiddel_type AS ENUM ('sleutel', 'telefoon', 'tankpas', 'overig');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS medewerker_bedrijfsmiddelen (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medewerker_id  uuid NOT NULL REFERENCES medewerkers(id) ON DELETE CASCADE,
  type           bedrijfsmiddel_type NOT NULL,
  omschrijving   text,
  kenmerken      jsonb NOT NULL DEFAULT '{}',
  uitgegeven_op  date,
  retour_op      date,
  actief         boolean NOT NULL DEFAULT true,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bedrijfsmiddelen_medewerker_idx ON medewerker_bedrijfsmiddelen(medewerker_id);

-- ── 4. Custom attribuutdefinities (beheerd door admin) ───────────────

DO $$ BEGIN
  CREATE TYPE attribuut_veldtype AS ENUM ('tekst', 'datum', 'getal', 'boolean');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS medewerker_attribuut_definities (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam      text NOT NULL,
  veldtype  attribuut_veldtype NOT NULL DEFAULT 'tekst',
  verplicht boolean NOT NULL DEFAULT false,
  volgorde  integer NOT NULL DEFAULT 0,
  actief    boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── 5. Custom attribuutwaarden per medewerker ────────────────────────

CREATE TABLE IF NOT EXISTS medewerker_attribuut_waarden (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medewerker_id uuid NOT NULL REFERENCES medewerkers(id) ON DELETE CASCADE,
  definitie_id  uuid NOT NULL REFERENCES medewerker_attribuut_definities(id) ON DELETE CASCADE,
  waarde        text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (medewerker_id, definitie_id)
);

CREATE INDEX IF NOT EXISTS attribuut_waarden_medewerker_idx ON medewerker_attribuut_waarden(medewerker_id);

-- ── 6. Bestanden per medewerker ───────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE bestand_categorie AS ENUM ('contract', 'certificaat', 'id_bewijs', 'vca_diploma', 'overig');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS medewerker_bestanden (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medewerker_id  uuid NOT NULL REFERENCES medewerkers(id) ON DELETE CASCADE,
  naam           text NOT NULL,
  url            text NOT NULL,
  categorie      bestand_categorie NOT NULL DEFAULT 'overig',
  bestandstype   text,
  grootte        bigint,
  geupload_door  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bestanden_medewerker_idx ON medewerker_bestanden(medewerker_id);

-- ── 7. Updated_at triggers voor nieuwe tabellen ───────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  CREATE TRIGGER bedrijfsmiddelen_updated_at
    BEFORE UPDATE ON medewerker_bedrijfsmiddelen
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER attribuut_definities_updated_at
    BEFORE UPDATE ON medewerker_attribuut_definities
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER attribuut_waarden_updated_at
    BEFORE UPDATE ON medewerker_attribuut_waarden
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
