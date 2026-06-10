-- Voeg kleur-per-niveau kolommen toe aan quote_layouts
ALTER TABLE quote_layouts
  ADD COLUMN IF NOT EXISTS kleur_niveau_2 text,
  ADD COLUMN IF NOT EXISTS kleur_niveau_3 text;
