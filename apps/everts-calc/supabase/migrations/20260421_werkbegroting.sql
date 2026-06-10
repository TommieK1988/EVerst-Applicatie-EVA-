-- ─── Werkbegroting Module ────────────────────────────────────────────────────
-- Migratie: Werkvoorbereiding fase — werkbegroting, kostengroepen, audittrail
-- Afhankelijkheden: alleen 'projects' en 'calculation_groups'

-- Kostengroep kolom toevoegen aan bestaande calculatieregels
ALTER TABLE calculation_lines ADD COLUMN IF NOT EXISTS kostengroep TEXT;

-- ─── Werkbegrotingen ──────────────────────────────────────────────────────────
-- scenario_id is een UUID-referentie (geen FK — scenarios-tabel niet in dit schema)

CREATE TABLE IF NOT EXISTS werkbegrotingen (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scenario_id   UUID NOT NULL,
  naam          TEXT NOT NULL DEFAULT 'Werkbegroting',
  status        TEXT NOT NULL DEFAULT 'concept'
                CHECK (status IN ('concept', 'definitief', 'geaccordeerd')),
  aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bijgewerkt_op TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scenario_id)
);

CREATE INDEX IF NOT EXISTS idx_werkbegrotingen_project_id  ON werkbegrotingen(project_id);
CREATE INDEX IF NOT EXISTS idx_werkbegrotingen_scenario_id ON werkbegrotingen(scenario_id);

ALTER TABLE werkbegrotingen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Toegang via project" ON werkbegrotingen
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ─── Werkbegroting Regels ─────────────────────────────────────────────────────
-- source_calculatieregel_id is UUID-referentie (geen FK — calculation_lines kan eigen schema hebben)
-- groep_id verwijst naar calculation_groups (bestaat wel in dit schema)

CREATE TABLE IF NOT EXISTS werkbegroting_regels (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  werkbegroting_id          UUID NOT NULL REFERENCES werkbegrotingen(id) ON DELETE CASCADE,
  source_calculatieregel_id UUID,
  groep_id                  UUID NOT NULL REFERENCES calculation_groups(id),
  omschrijving              TEXT NOT NULL DEFAULT '',
  hoeveelheid               NUMERIC(12,4) NOT NULL DEFAULT 0,   -- LOCKED: nooit aanpasbaar
  eenheid                   TEXT NOT NULL DEFAULT 'st',
  kostengroep               TEXT,
  volgorde                  INTEGER NOT NULL DEFAULT 0,
  opslag_pct                NUMERIC(5,2),
  btw_pct                   NUMERIC(4,2),
  opmerking                 TEXT,
  is_stelpost               BOOLEAN NOT NULL DEFAULT FALSE,
  aangemaakt_op             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bijgewerkt_op             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wb_regels_werkbegroting_id ON werkbegroting_regels(werkbegroting_id);
CREATE INDEX IF NOT EXISTS idx_wb_regels_groep_id         ON werkbegroting_regels(groep_id);

ALTER TABLE werkbegroting_regels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Toegang via werkbegroting" ON werkbegroting_regels
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ─── Werkbegroting Componenten ────────────────────────────────────────────────
-- source_component_id is UUID-referentie (geen FK — component_lines niet in dit schema)

CREATE TABLE IF NOT EXISTS werkbegroting_componenten (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  werkbegroting_regel_id UUID NOT NULL REFERENCES werkbegroting_regels(id) ON DELETE CASCADE,
  source_component_id    UUID,
  type                   TEXT NOT NULL CHECK (type IN ('arbeid', 'materieel', 'onderaanneming')),
  norm_hoeveelheid       NUMERIC(10,4) NOT NULL DEFAULT 0,
  eenheid                TEXT,
  tarief                 NUMERIC(10,4) NOT NULL DEFAULT 0,
  opslag_pct             NUMERIC(5,2),
  omschrijving           TEXT,
  relatie_id             UUID,
  leverancier_naam       TEXT,
  aannemersnaam          TEXT,
  offertenummer          TEXT,
  aangemaakt_op          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bijgewerkt_op          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wb_comps_regel_id ON werkbegroting_componenten(werkbegroting_regel_id);

ALTER TABLE werkbegroting_componenten ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Toegang via werkbegroting_regel" ON werkbegroting_componenten
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ─── Werkbegroting Wijzigingen ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS werkbegroting_wijzigingen (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  werkbegroting_id       UUID NOT NULL REFERENCES werkbegrotingen(id) ON DELETE CASCADE,
  werkbegroting_regel_id UUID REFERENCES werkbegroting_regels(id) ON DELETE SET NULL,
  component_id           UUID REFERENCES werkbegroting_componenten(id) ON DELETE SET NULL,
  veld                   TEXT NOT NULL,
  oude_waarde            TEXT,
  nieuwe_waarde          TEXT,
  user_id                UUID REFERENCES auth.users(id),
  aangemaakt_op          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wb_wijz_werkbegroting_id ON werkbegroting_wijzigingen(werkbegroting_id);
CREATE INDEX IF NOT EXISTS idx_wb_wijz_regel_id         ON werkbegroting_wijzigingen(werkbegroting_regel_id);

ALTER TABLE werkbegroting_wijzigingen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inzien eigen wijzigingen" ON werkbegroting_wijzigingen
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Toevoegen wijzigingen" ON werkbegroting_wijzigingen
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ─── Werkbegroting Bestellingen ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS werkbegroting_bestellingen (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  werkbegroting_id UUID NOT NULL REFERENCES werkbegrotingen(id) ON DELETE CASCADE,
  omschrijving     TEXT NOT NULL,
  relatie_id       UUID,
  status           TEXT NOT NULL DEFAULT 'concept'
                   CHECK (status IN ('concept', 'verzonden', 'bevestigd')),
  aangemaakt_op    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bijgewerkt_op    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wb_bestellingen_werkbegroting_id ON werkbegroting_bestellingen(werkbegroting_id);

ALTER TABLE werkbegroting_bestellingen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Toegang via werkbegroting" ON werkbegroting_bestellingen
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS werkbegroting_bestelling_regels (
  bestelling_id UUID NOT NULL REFERENCES werkbegroting_bestellingen(id) ON DELETE CASCADE,
  component_id  UUID NOT NULL REFERENCES werkbegroting_componenten(id) ON DELETE CASCADE,
  PRIMARY KEY (bestelling_id, component_id)
);

ALTER TABLE werkbegroting_bestelling_regels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Toegang via bestelling" ON werkbegroting_bestelling_regels
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ─── Trigger: bijgewerkt_op automatisch bijwerken ─────────────────────────────

CREATE OR REPLACE FUNCTION update_bijgewerkt_op_wb()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.bijgewerkt_op = NOW();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_werkbegrotingen_bijgewerkt') THEN
    CREATE TRIGGER trg_werkbegrotingen_bijgewerkt
      BEFORE UPDATE ON werkbegrotingen
      FOR EACH ROW EXECUTE FUNCTION update_bijgewerkt_op_wb();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_wb_regels_bijgewerkt') THEN
    CREATE TRIGGER trg_wb_regels_bijgewerkt
      BEFORE UPDATE ON werkbegroting_regels
      FOR EACH ROW EXECUTE FUNCTION update_bijgewerkt_op_wb();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_wb_componenten_bijgewerkt') THEN
    CREATE TRIGGER trg_wb_componenten_bijgewerkt
      BEFORE UPDATE ON werkbegroting_componenten
      FOR EACH ROW EXECUTE FUNCTION update_bijgewerkt_op_wb();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_wb_bestellingen_bijgewerkt') THEN
    CREATE TRIGGER trg_wb_bestellingen_bijgewerkt
      BEFORE UPDATE ON werkbegroting_bestellingen
      FOR EACH ROW EXECUTE FUNCTION update_bijgewerkt_op_wb();
  END IF;
END $$;
