-- ─── Schilderwerk bibliotheek ────────────────────────────────────────────────
-- Hiërarchie: Onderdeel → Type → Behandeling
-- Combinatie van die drie = een Schilderrecept met normenset

-- Onderdelen (bijv. Houten kozijn, Stalen deur, Betonnen kolom)
CREATE TABLE IF NOT EXISTS schilder_onderdelen (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  naam        TEXT        NOT NULL,
  code        TEXT,
  actief      BOOLEAN     NOT NULL DEFAULT true,
  volgorde    INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Types per onderdeel (bijv. Binnendraaiend, Buitendraaiend, Overhead)
CREATE TABLE IF NOT EXISTS schilder_types (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  onderdeel_id  UUID        NOT NULL REFERENCES schilder_onderdelen(id) ON DELETE CASCADE,
  naam          TEXT        NOT NULL,
  code          TEXT,
  eenheid       TEXT        NOT NULL DEFAULT 'm²',   -- 'm²' | 'm¹' | 'm³' | 'st'
  formule       TEXT,                                -- NULL = automatisch; voor m¹ bijv. '2*B+2*H'
  actief        BOOLEAN     NOT NULL DEFAULT true,
  volgorde      INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Behandelingen (uit Basisverfbestek 2020)
CREATE TABLE IF NOT EXISTS schilder_behandelingen (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  naam        TEXT        NOT NULL,
  code        TEXT,
  bron        TEXT        DEFAULT 'Basisverfbestek 2020',
  actief      BOOLEAN     NOT NULL DEFAULT true,
  volgorde    INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Schilderrecepten: de koppeling Onderdeel + Type + Behandeling
-- Één combinatie = één normenset (meerdere normenrijen mogelijk)
CREATE TABLE IF NOT EXISTS schilder_combinaties (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  onderdeel_id    UUID        NOT NULL REFERENCES schilder_onderdelen(id)   ON DELETE CASCADE,
  type_id         UUID        NOT NULL REFERENCES schilder_types(id)        ON DELETE CASCADE,
  behandeling_id  UUID        NOT NULL REFERENCES schilder_behandelingen(id) ON DELETE CASCADE,
  actief          BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (onderdeel_id, type_id, behandeling_id)
);

-- Arbeidsnormen per schilderrecept (meerdere rijen mogelijk)
CREATE TABLE IF NOT EXISTS schilder_arbeid_normen (
  id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  combinatie_id     UUID           NOT NULL REFERENCES schilder_combinaties(id) ON DELETE CASCADE,
  omschrijving      TEXT,
  minutes_per_unit  NUMERIC(10,4)  NOT NULL DEFAULT 0,  -- minuten per eenheid
  hour_rate         NUMERIC(10,2)  NOT NULL DEFAULT 0,  -- €/uur
  cost_per_unit     NUMERIC(10,4)  NOT NULL DEFAULT 0,  -- (minutes/60) * hour_rate
  unit              TEXT           NOT NULL DEFAULT 'm²',
  actief            BOOLEAN        NOT NULL DEFAULT true,
  volgorde          INTEGER        NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Materiaal- en OA-normen per schilderrecept (meerdere rijen mogelijk)
CREATE TABLE IF NOT EXISTS schilder_materiaal_normen (
  id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  combinatie_id         UUID           NOT NULL REFERENCES schilder_combinaties(id) ON DELETE CASCADE,
  naam                  TEXT,
  norm_type             TEXT           NOT NULL DEFAULT 'materiaal',  -- 'materiaal' | 'onderaanneming'
  quantity_per_unit     NUMERIC(10,4)  NOT NULL DEFAULT 0,
  eenheid               TEXT           DEFAULT 'ltr',
  unit_price            NUMERIC(10,4)  NOT NULL DEFAULT 0,
  cost_per_unit         NUMERIC(10,4)  NOT NULL DEFAULT 0,
  actief                BOOLEAN        NOT NULL DEFAULT true,
  volgorde              INTEGER        NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Indexes voor snelle lookups
CREATE INDEX IF NOT EXISTS idx_schilder_types_onderdeel     ON schilder_types      (onderdeel_id);
CREATE INDEX IF NOT EXISTS idx_schilder_combinaties_type    ON schilder_combinaties (type_id);
CREATE INDEX IF NOT EXISTS idx_schilder_combinaties_onderdeel ON schilder_combinaties (onderdeel_id);
CREATE INDEX IF NOT EXISTS idx_schilder_arbeid_combinatie   ON schilder_arbeid_normen   (combinatie_id);
CREATE INDEX IF NOT EXISTS idx_schilder_materiaal_combinatie ON schilder_materiaal_normen (combinatie_id);

-- RLS uitschakelen (intern gebruik, geen row-level security nodig)
ALTER TABLE schilder_onderdelen      DISABLE ROW LEVEL SECURITY;
ALTER TABLE schilder_types           DISABLE ROW LEVEL SECURITY;
ALTER TABLE schilder_behandelingen   DISABLE ROW LEVEL SECURITY;
ALTER TABLE schilder_combinaties     DISABLE ROW LEVEL SECURITY;
ALTER TABLE schilder_arbeid_normen   DISABLE ROW LEVEL SECURITY;
ALTER TABLE schilder_materiaal_normen DISABLE ROW LEVEL SECURITY;
