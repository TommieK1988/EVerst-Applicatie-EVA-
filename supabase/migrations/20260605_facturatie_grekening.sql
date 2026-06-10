-- =====================================================================
-- Facturatie: G-rekening en N-rekening velden (ketenaansprakelijkheid)
-- =====================================================================

ALTER TABLE public.relatie_facturatie
  ADD COLUMN IF NOT EXISTS g_rekening_tekst          text,
  ADD COLUMN IF NOT EXISTS g_rekening_percentage     numeric(5,2),
  ADD COLUMN IF NOT EXISTS loonkostenbestanddeel_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS n_rekening_tekst          text;
