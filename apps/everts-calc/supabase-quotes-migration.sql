-- ============================================================
-- EvertsCalc — Offertegenerator MVP
-- Uitvoeren in: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS quote_volgnummer START 1;

-- ── Klanten ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam        text NOT NULL,
  bedrijfsnaam text,
  adres       text,
  postcode    text,
  plaats      text,
  email       text,
  telefoon    text,
  kvk         text,
  btw_nummer  text,
  notities    text,
  actief      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ── Lay-outs (voor latere uitbreiding) ──────────────────────
CREATE TABLE IF NOT EXISTS quote_layouts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam           text NOT NULL,
  beschrijving   text,
  logo_url       text,
  primaire_kleur text DEFAULT '#1a56db',
  is_standaard   boolean DEFAULT false,
  created_at     timestamptz DEFAULT now()
);

-- ── Templates (standaard voorwaarden etc.) ──────────────────
CREATE TABLE IF NOT EXISTS quote_templates (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam                     text NOT NULL,
  beschrijving             text,
  standaard_voorwaarden    text,
  standaard_uitsluitingen  text,
  standaard_opmerkingen    text,
  geldigheid_dagen         integer DEFAULT 30,
  is_standaard             boolean DEFAULT false,
  created_at               timestamptz DEFAULT now()
);

-- ── Offertes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_nummer      text NOT NULL UNIQUE DEFAULT '',
  project_id        text,
  scenario_id       text,
  client_id         uuid REFERENCES clients(id) ON DELETE SET NULL,
  layout_id         uuid REFERENCES quote_layouts(id) ON DELETE SET NULL,
  template_id       uuid REFERENCES quote_templates(id) ON DELETE SET NULL,
  type              text NOT NULL DEFAULT 'verkoopofferte'
                      CHECK (type IN ('verkoopofferte','interne_calculatie')),
  status            text NOT NULL DEFAULT 'concept'
                      CHECK (status IN ('concept','verzonden','geaccepteerd','afgewezen','verlopen')),
  titel             text NOT NULL DEFAULT 'Offerte',
  referentie        text,
  datum             date NOT NULL DEFAULT CURRENT_DATE,
  geldig_tot        date,
  contactpersoon    text,
  aanhef            text DEFAULT 'Geachte heer/mevrouw,',
  inleiding         text,
  slottekst         text,
  subtotaal_ex_btw  numeric(12,2) NOT NULL DEFAULT 0,
  btw_bedrag        numeric(12,2) NOT NULL DEFAULT 0,
  totaal_inc_btw    numeric(12,2) NOT NULL DEFAULT 0,
  detailregels_tonen boolean NOT NULL DEFAULT true,
  btw_pct           numeric(5,2) NOT NULL DEFAULT 21,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- Auto-nummering: OFT-YYYY-NNN
CREATE OR REPLACE FUNCTION set_quote_nummer()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quote_nummer = '' THEN
    NEW.quote_nummer := 'OFT-' || TO_CHAR(NOW(), 'YYYY') || '-'
      || LPAD(nextval('quote_volgnummer')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quote_auto_nummer ON quotes;
CREATE TRIGGER quote_auto_nummer
  BEFORE INSERT ON quotes
  FOR EACH ROW EXECUTE FUNCTION set_quote_nummer();

-- ── Secties per discipline ───────────────────────────────────
CREATE TABLE IF NOT EXISTS quote_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  naam        text NOT NULL,
  discipline  text CHECK (discipline IN
                ('schilderwerk','bouwkundig','dakwerk','meerwerk','overig')),
  volgorde    integer NOT NULL DEFAULT 0,
  subtotaal   numeric(12,2) NOT NULL DEFAULT 0,
  toon_detail boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- ── Offerteregels ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quote_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id            uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  section_id          uuid REFERENCES quote_sections(id) ON DELETE SET NULL,
  calculatieregel_id  text,
  groep_id            text,
  omschrijving        text NOT NULL DEFAULT '',
  hoeveelheid         numeric(10,3) NOT NULL DEFAULT 1,
  eenheid             text NOT NULL DEFAULT 'st',
  eenheidsprijs       numeric(12,2) NOT NULL DEFAULT 0,
  line_total          numeric(12,2) NOT NULL DEFAULT 0,
  btw_pct             numeric(5,2) NOT NULL DEFAULT 21,
  volgorde            integer NOT NULL DEFAULT 0,
  kostprijs_pe        numeric(12,2),
  uren_pe             numeric(8,3),
  opmerking           text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ── Voorwaarden / uitsluitingen / opmerkingen ────────────────
CREATE TABLE IF NOT EXISTS quote_terms (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  type     text NOT NULL CHECK (type IN ('voorwaarden','uitsluitingen','opmerkingen')),
  inhoud   text NOT NULL DEFAULT '',
  volgorde integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ── Row Level Security ───────────────────────────────────────
ALTER TABLE clients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_lines    ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_terms    ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_layouts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clients' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON clients FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='quotes' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='quote_sections' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON quote_sections FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='quote_lines' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON quote_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='quote_terms' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON quote_terms FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='quote_layouts' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON quote_layouts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='quote_templates' AND policyname='auth_all') THEN
    CREATE POLICY "auth_all" ON quote_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Standaard template seed ───────────────────────────────────
INSERT INTO quote_templates (naam, is_standaard, geldigheid_dagen,
  standaard_voorwaarden, standaard_uitsluitingen, standaard_opmerkingen)
SELECT
  'Standaard schilderwerk', true, 30,
  E'1. Alle prijzen zijn exclusief BTW.\n2. Betaling binnen 14 dagen na factuurdatum.\n3. Meerwerk wordt alleen uitgevoerd na schriftelijke opdracht.\n4. Offerte geldig gedurende 30 dagen na offertedatum.\n5. Op al onze werkzaamheden zijn onze algemene voorwaarden van toepassing.',
  E'- Steiger- en stijgmateriaal tenzij anders vermeld\n- Schilderwerk aan binnenzijde tenzij expliciet vermeld\n- Onderhoudswerk aan dakgoten en loodwerk\n- Herstel van houtrot en kwaliteitsgebreken in hout',
  E'- Kleur conform kleuradvies opdrachtgever\n- Werkzaamheden op werkdagen 07:00–17:00\n- Eventuele meerwerkopdrachten worden separaat geoffreerd'
WHERE NOT EXISTS (SELECT 1 FROM quote_templates WHERE is_standaard = true);
