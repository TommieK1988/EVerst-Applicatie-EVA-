-- ============================================================
-- Migration v5: Sjabloonteksten, Betalingscondities, Algemene Voorwaarden
-- Voer uit in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Sjabloonteksten: herbruikbare HTML-blokken voor layout-editor
CREATE TABLE IF NOT EXISTS sjabloonteksten (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam       text NOT NULL,
  inhoud_html text NOT NULL DEFAULT '',
  categorie  text DEFAULT 'algemeen',
  volgorde   integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Betalingscondities: selecteerbaar per offerte
CREATE TABLE IF NOT EXISTS betalingscondities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam         text NOT NULL,
  tekst        text NOT NULL DEFAULT '',
  is_standaard boolean DEFAULT false,
  volgorde     integer DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

-- 3. Algemene voorwaarden: PDF-documenten als bijlage
CREATE TABLE IF NOT EXISTS algemene_voorwaarden (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam         text NOT NULL,
  bestand_url  text NOT NULL,
  versie       text,
  is_standaard boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

-- 4. Koppeling naar quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS betalingsconditie_id uuid REFERENCES betalingscondities(id) ON DELETE SET NULL;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS voorwaarden_id uuid REFERENCES algemene_voorwaarden(id) ON DELETE SET NULL;

-- 5. WYSIWYG body in quote_layouts (los van de full html_template)
ALTER TABLE quote_layouts ADD COLUMN IF NOT EXISTS wysiwyg_body text;

-- 6. Supabase Storage bucket voor AV-bestanden
-- Voer dit apart uit of maak de bucket aan via het Supabase dashboard:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('algemene-voorwaarden', 'algemene-voorwaarden', true)
-- ON CONFLICT DO NOTHING;

-- Standaard betalingscondities invoegen
INSERT INTO betalingscondities (naam, tekst, is_standaard, volgorde) VALUES
  ('30 dagen netto', 'Betaling dient te geschieden binnen 30 dagen na factuurdatum.', true, 1),
  ('14 dagen netto', 'Betaling dient te geschieden binnen 14 dagen na factuurdatum.', false, 2),
  ('Aanbetaling 30%', 'Een aanbetaling van 30% is verschuldigd bij opdrachtverstrekking. Het resterende bedrag dient binnen 14 dagen na oplevering te worden voldaan.', false, 3),
  ('Aanbetaling 50%', 'Een aanbetaling van 50% is verschuldigd bij opdrachtverstrekking. Het resterende bedrag dient binnen 14 dagen na oplevering te worden voldaan.', false, 4)
ON CONFLICT DO NOTHING;
