-- Persoonlijke accountinstellingen voor medewerkers
ALTER TABLE medewerkers
  ADD COLUMN IF NOT EXISTS notificatie_voorkeuren jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS voorkeuren jsonb NOT NULL DEFAULT '{}';
