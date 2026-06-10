-- ============================================================
-- EvertsCalc — Layout Template Engine (v4)
-- Uitvoeren in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Breid quote_layouts uit met volledige template-engine ondersteuning
ALTER TABLE quote_layouts
  ADD COLUMN IF NOT EXISTS html_template    text,           -- Handlebars HTML template
  ADD COLUMN IF NOT EXISTS secundaire_kleur text DEFAULT '#f8fafc',
  ADD COLUMN IF NOT EXISTS accent_kleur     text DEFAULT '#0a7a35',
  ADD COLUMN IF NOT EXISTS lettertype       text DEFAULT 'system-ui, sans-serif',
  ADD COLUMN IF NOT EXISTS lettergrootte    integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS papier_formaat   text DEFAULT 'A4'
                              CHECK (papier_formaat IN ('A4', 'A3')),
  ADD COLUMN IF NOT EXISTS papier_orientatie text DEFAULT 'portrait'
                              CHECK (papier_orientatie IN ('portrait', 'landscape')),
  ADD COLUMN IF NOT EXISTS marge_boven      integer DEFAULT 15,
  ADD COLUMN IF NOT EXISTS marge_onder      integer DEFAULT 15,
  ADD COLUMN IF NOT EXISTS marge_links      integer DEFAULT 18,
  ADD COLUMN IF NOT EXISTS marge_rechts     integer DEFAULT 18,
  ADD COLUMN IF NOT EXISTS toon_voorblad    boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS toon_specificatie boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS toon_voorwaarden boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS toon_paginanummer boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS koptekst         text,
  ADD COLUMN IF NOT EXISTS voettekst        text DEFAULT 'Pagina {{paginanummer}} van {{totaal_paginas}}',
  ADD COLUMN IF NOT EXISTS updated_at       timestamptz DEFAULT now();

-- Bijhouden van updated_at
CREATE OR REPLACE FUNCTION set_layout_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS layout_updated_at ON quote_layouts;
CREATE TRIGGER layout_updated_at
  BEFORE UPDATE ON quote_layouts
  FOR EACH ROW EXECUTE FUNCTION set_layout_updated_at();

-- Preview route API key (voor iframe preview zonder auth)
ALTER TABLE quote_layouts
  ADD COLUMN IF NOT EXISTS preview_token text DEFAULT encode(gen_random_bytes(16), 'hex');
