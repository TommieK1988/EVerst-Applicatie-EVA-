-- ─── EvertsCalc Schema ───────────────────────────────────────────────────────
-- Migratie 001: Volledig basisschema

-- UUID extensie
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE project_discipline AS ENUM (
  'schilderwerk', 'bouwkundig', 'dakwerk', 'dagelijks_onderhoud', 'gemengd'
);

CREATE TYPE project_status AS ENUM (
  'concept', 'offerte', 'gewonnen', 'verloren', 'uitvoering', 'afgerond'
);

CREATE TYPE component_type AS ENUM (
  'arbeid', 'materieel', 'onderaanneming'
);

CREATE TYPE measurement_status AS ENUM (
  'concept', 'definitief', 'gesynchroniseerd'
);

-- ─── Projects ─────────────────────────────────────────────────────────────────

CREATE TABLE projects (
  id                           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                         TEXT NOT NULL,
  naam                         TEXT NOT NULL,
  opdrachtgever                TEXT NOT NULL DEFAULT '',
  opdrachtgever_contactpersoon TEXT,
  opdrachtgever_email          TEXT,
  adres                        TEXT,
  discipline                   project_discipline NOT NULL DEFAULT 'schilderwerk',
  status                       project_status NOT NULL DEFAULT 'concept',
  eigenaar                     TEXT NOT NULL DEFAULT '',
  notities                     TEXT,
  aangemaakt_op                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bijgewerkt_op                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id                      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_status  ON projects(status);

-- Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gebruiker ziet eigen projecten" ON projects
  FOR ALL USING (auth.uid() = user_id);

-- ─── Scenarios ────────────────────────────────────────────────────────────────

CREATE TABLE scenarios (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id              UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  naam                    TEXT NOT NULL DEFAULT 'Basisvariant',
  is_standaard            BOOLEAN NOT NULL DEFAULT FALSE,
  opslag_algemene_kosten  NUMERIC(5,2) NOT NULL DEFAULT 8,
  opslag_winst_risico     NUMERIC(5,2) NOT NULL DEFAULT 10,
  opslag_overhead         NUMERIC(5,2) NOT NULL DEFAULT 0,
  aangemaakt_op           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bijgewerkt_op           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scenarios_project_id ON scenarios(project_id);

ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Toegang via project" ON scenarios
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE id = scenarios.project_id AND user_id = auth.uid())
  );

-- ─── Calculation Groups (groepen) ─────────────────────────────────────────────

CREATE TABLE calculation_groups (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scenario_id   UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  parent_id     UUID REFERENCES calculation_groups(id) ON DELETE CASCADE,
  naam          TEXT NOT NULL,
  niveau        SMALLINT NOT NULL CHECK (niveau BETWEEN 1 AND 3),
  volgorde      INTEGER NOT NULL DEFAULT 0,
  ingeklapt     BOOLEAN NOT NULL DEFAULT FALSE,
  optioneel     BOOLEAN NOT NULL DEFAULT FALSE,
  aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bijgewerkt_op TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calc_groups_scenario_id ON calculation_groups(scenario_id);
CREATE INDEX idx_calc_groups_parent_id   ON calculation_groups(parent_id);

ALTER TABLE calculation_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Toegang via scenario" ON calculation_groups
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM scenarios s
      JOIN projects p ON p.id = s.project_id
      WHERE s.id = calculation_groups.scenario_id AND p.user_id = auth.uid()
    )
  );

-- ─── Calculation Lines (calculatieregels) ─────────────────────────────────────

CREATE TABLE calculation_lines (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  groep_id         UUID NOT NULL REFERENCES calculation_groups(id) ON DELETE CASCADE,
  omschrijving     TEXT NOT NULL DEFAULT '',
  werkomschrijving TEXT,
  hoeveelheid      NUMERIC(12,4) NOT NULL DEFAULT 0,
  eenheid          TEXT NOT NULL DEFAULT 'm²',
  volgorde         INTEGER NOT NULL DEFAULT 0,
  opslag_pct       NUMERIC(5,2),
  is_stelpost      BOOLEAN NOT NULL DEFAULT FALSE,
  gemarkeerd       BOOLEAN NOT NULL DEFAULT FALSE,
  btw_pct          NUMERIC(4,2),
  opmerking        TEXT,
  aangemaakt_op    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bijgewerkt_op    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calc_lines_groep_id ON calculation_lines(groep_id);

ALTER TABLE calculation_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Toegang via groep" ON calculation_lines
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM calculation_groups g
      JOIN scenarios s ON s.id = g.scenario_id
      JOIN projects p ON p.id = s.project_id
      WHERE g.id = calculation_lines.groep_id AND p.user_id = auth.uid()
    )
  );

-- ─── Component Lines (componentregels) ────────────────────────────────────────

CREATE TABLE component_lines (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  calculation_line_id  UUID NOT NULL REFERENCES calculation_lines(id) ON DELETE CASCADE,
  type                 component_type NOT NULL,
  norm_hoeveelheid     NUMERIC(10,4) NOT NULL DEFAULT 0,
  eenheid              TEXT,
  tarief               NUMERIC(10,4) NOT NULL DEFAULT 0,
  opslag_pct           NUMERIC(5,2),
  omschrijving         TEXT,
  leverancier          TEXT,
  aannemersnaam        TEXT,
  offertenummer        TEXT,
  aangemaakt_op        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bijgewerkt_op        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comp_lines_calc_line_id ON component_lines(calculation_line_id);

ALTER TABLE component_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Toegang via calculatieregel" ON component_lines
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM calculation_lines cl
      JOIN calculation_groups g ON g.id = cl.groep_id
      JOIN scenarios s ON s.id = g.scenario_id
      JOIN projects p ON p.id = s.project_id
      WHERE cl.id = component_lines.calculation_line_id AND p.user_id = auth.uid()
    )
  );

-- ─── Paint Measurements (meetstaten) ──────────────────────────────────────────

CREATE TABLE paint_measurements (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scenario_id   UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  naam          TEXT NOT NULL,
  code          TEXT NOT NULL,
  status        measurement_status NOT NULL DEFAULT 'concept',
  aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aangepast_op  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_paint_meas_scenario_id ON paint_measurements(scenario_id);

ALTER TABLE paint_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Toegang via project" ON paint_measurements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE id = paint_measurements.project_id AND user_id = auth.uid())
  );

-- ─── Paint Measurement Lines (meetregels) ─────────────────────────────────────

CREATE TABLE paint_measurement_lines (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  measurement_id       UUID NOT NULL REFERENCES paint_measurements(id) ON DELETE CASCADE,
  groep_id             UUID NOT NULL REFERENCES calculation_groups(id),
  volgorde             INTEGER NOT NULL DEFAULT 0,
  onderdeel            TEXT,
  type                 TEXT,
  behandeling          TEXT,
  omschrijving         TEXT,
  bestek_kenmerk       TEXT,
  breedte              NUMERIC(10,3),
  hoogte               NUMERIC(10,3),
  lengte               NUMERIC(10,3),
  aantal               NUMERIC(8,2) NOT NULL DEFAULT 1,
  eenheid              TEXT NOT NULL DEFAULT 'm²',
  hoeveelheid_override NUMERIC(12,4),
  aangepast_op         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_paint_meas_lines_measurement_id ON paint_measurement_lines(measurement_id);
CREATE INDEX idx_paint_meas_lines_groep_id       ON paint_measurement_lines(groep_id);
CREATE INDEX idx_paint_meas_lines_sleutel ON paint_measurement_lines(measurement_id, groep_id, onderdeel, behandeling);

ALTER TABLE paint_measurement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Toegang via meetstaat" ON paint_measurement_lines
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM paint_measurements pm
      JOIN projects p ON p.id = pm.project_id
      WHERE pm.id = paint_measurement_lines.measurement_id AND p.user_id = auth.uid()
    )
  );

-- ─── Paint Measurement Aggregates (aggregaten) ────────────────────────────────

CREATE TABLE paint_measurement_aggregates (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  measurement_id       UUID NOT NULL REFERENCES paint_measurements(id) ON DELETE CASCADE,
  groep_id             UUID NOT NULL REFERENCES calculation_groups(id),
  onderdeel            TEXT NOT NULL,
  type                 TEXT NOT NULL DEFAULT '',
  behandeling          TEXT NOT NULL,
  totaal_hoeveelheid   NUMERIC(12,4) NOT NULL DEFAULT 0,
  eenheid              TEXT NOT NULL DEFAULT 'm²',
  calculation_line_id  UUID REFERENCES calculation_lines(id) ON DELETE SET NULL,
  is_gesynchroniseerd  BOOLEAN NOT NULL DEFAULT FALSE,
  aangepast_op         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (measurement_id, groep_id, onderdeel, type, behandeling)
);

CREATE INDEX idx_paint_agg_measurement_id ON paint_measurement_aggregates(measurement_id);

ALTER TABLE paint_measurement_aggregates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Toegang via meetstaat" ON paint_measurement_aggregates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM paint_measurements pm
      JOIN projects p ON p.id = pm.project_id
      WHERE pm.id = paint_measurement_aggregates.measurement_id AND p.user_id = auth.uid()
    )
  );

-- ─── Paint Items bibliotheek ──────────────────────────────────────────────────

CREATE TABLE paint_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          TEXT NOT NULL UNIQUE,
  onderdeel     TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT '',
  behandeling   TEXT NOT NULL,
  eenheid       TEXT NOT NULL DEFAULT 'm²',
  is_actief     BOOLEAN NOT NULL DEFAULT TRUE,
  aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_paint_items_onderdeel    ON paint_items(onderdeel);
CREATE INDEX idx_paint_items_behandeling  ON paint_items(behandeling);

-- Bibliotheek is publiek leesbaar (geen RLS nodig voor reads)
ALTER TABLE paint_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Iedereen kan lezen" ON paint_items
  FOR SELECT USING (TRUE);

-- ─── Labor Norms ──────────────────────────────────────────────────────────────

CREATE TABLE labor_norms (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paint_item_id     UUID NOT NULL REFERENCES paint_items(id) ON DELETE CASCADE,
  uren_per_eenheid  NUMERIC(6,4) NOT NULL,
  tarief_per_uur    NUMERIC(8,2),
  geldig_vanaf      DATE NOT NULL DEFAULT CURRENT_DATE,
  aangemaakt_op     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_labor_norms_paint_item_id ON labor_norms(paint_item_id);

ALTER TABLE labor_norms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Iedereen kan lezen" ON labor_norms
  FOR SELECT USING (TRUE);

-- ─── Material Norms ───────────────────────────────────────────────────────────

CREATE TABLE material_norms (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paint_item_id             UUID NOT NULL REFERENCES paint_items(id) ON DELETE CASCADE,
  product_naam              TEXT NOT NULL,
  hoeveelheid_per_eenheid   NUMERIC(8,4) NOT NULL,
  eenheid                   TEXT NOT NULL,
  prijs_per_eenheid         NUMERIC(8,4),
  geldig_vanaf              DATE NOT NULL DEFAULT CURRENT_DATE,
  aangemaakt_op             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_material_norms_paint_item_id ON material_norms(paint_item_id);

ALTER TABLE material_norms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Iedereen kan lezen" ON material_norms
  FOR SELECT USING (TRUE);

-- ─── Updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_bijgewerkt_op()
RETURNS TRIGGER AS $$
BEGIN
  NEW.bijgewerkt_op = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projects_bijgewerkt_op
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_bijgewerkt_op();

CREATE TRIGGER trg_scenarios_bijgewerkt_op
  BEFORE UPDATE ON scenarios
  FOR EACH ROW EXECUTE FUNCTION update_bijgewerkt_op();

CREATE TRIGGER trg_calc_groups_bijgewerkt_op
  BEFORE UPDATE ON calculation_groups
  FOR EACH ROW EXECUTE FUNCTION update_bijgewerkt_op();

CREATE TRIGGER trg_calc_lines_bijgewerkt_op
  BEFORE UPDATE ON calculation_lines
  FOR EACH ROW EXECUTE FUNCTION update_bijgewerkt_op();

CREATE TRIGGER trg_comp_lines_bijgewerkt_op
  BEFORE UPDATE ON component_lines
  FOR EACH ROW EXECUTE FUNCTION update_bijgewerkt_op();
