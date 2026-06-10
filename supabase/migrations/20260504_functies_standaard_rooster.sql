ALTER TABLE medewerker_functies
  ADD COLUMN IF NOT EXISTS standaard_rooster jsonb;
