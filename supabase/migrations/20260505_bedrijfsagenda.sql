-- =====================================================================
-- Everts Platform — Bedrijfsagenda
-- =====================================================================

-- 1. ENUMs

DO $$ BEGIN
  CREATE TYPE bedrijfsagenda_type AS ENUM (
    'vca_toolbox', 'audit', 'teamoverleg', 'activiteit', 'herinnering', 'atv_dag', 'overig'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE bedrijfsagenda_herhaling AS ENUM (
    'geen', 'dagelijks', 'wekelijks', 'maandelijks', 'jaarlijks'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. HOOFDTABEL

CREATE TABLE IF NOT EXISTS public.bedrijfsagenda_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type                bedrijfsagenda_type NOT NULL DEFAULT 'overig',
  titel               text NOT NULL,
  omschrijving        text,
  start_datum         date NOT NULL,
  eind_datum          date NOT NULL,
  start_tijd          time,
  eind_tijd           time,
  hele_dag            boolean NOT NULL DEFAULT true,
  locatie             text,
  kleur               text,
  herhaling           bedrijfsagenda_herhaling NOT NULL DEFAULT 'geen',
  herhaling_einde     date,
  in_planning         boolean NOT NULL DEFAULT false,
  in_agenda           boolean NOT NULL DEFAULT false,
  stuur_herinnering   boolean NOT NULL DEFAULT false,
  herinnering_dagen   smallint NOT NULL DEFAULT 1,
  aangemaakt_door     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eind_na_start CHECK (eind_datum >= start_datum),
  CONSTRAINT herinnering_positief CHECK (herinnering_dagen > 0)
);

-- 3. INDEXEN

CREATE INDEX IF NOT EXISTS bedrijfsagenda_datum_idx
  ON public.bedrijfsagenda_items (start_datum, eind_datum);

CREATE INDEX IF NOT EXISTS bedrijfsagenda_planning_idx
  ON public.bedrijfsagenda_items (in_planning)
  WHERE in_planning = true;

-- 4. UPDATED_AT TRIGGER (set_updated_at() bestaat al in de database)

DO $$ BEGIN
  CREATE TRIGGER bedrijfsagenda_updated_at
    BEFORE UPDATE ON public.bedrijfsagenda_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. RLS

ALTER TABLE public.bedrijfsagenda_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "bedrijfsagenda_lezen"
    ON public.bedrijfsagenda_items FOR SELECT
    TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "bedrijfsagenda_schrijven"
    ON public.bedrijfsagenda_items FOR ALL
    TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
