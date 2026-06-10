-- Migration v2: Voeg voorblad-sjabloon velden toe aan quote_templates
-- Uitvoeren in Supabase SQL Editor

ALTER TABLE quote_templates
  ADD COLUMN IF NOT EXISTS standaard_aanhef text,
  ADD COLUMN IF NOT EXISTS standaard_inleiding text,
  ADD COLUMN IF NOT EXISTS standaard_slottekst text;
