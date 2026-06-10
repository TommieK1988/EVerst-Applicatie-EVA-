-- Voeg kleur-kolom toe aan medewerkers voor gebruik in planningweergave
ALTER TABLE medewerkers
  ADD COLUMN IF NOT EXISTS kleur text
  CONSTRAINT medewerkers_kleur_hex CHECK (kleur IS NULL OR kleur ~ '^#[0-9a-fA-F]{6}$');
