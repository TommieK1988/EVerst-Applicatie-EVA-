-- Voeg bouw7-sync velden en vergrendeling toe aan contactpersonen
ALTER TABLE contactpersonen
  ADD COLUMN IF NOT EXISTS bouw7_id             text,
  ADD COLUMN IF NOT EXISTS bouw7_laatst_sync    timestamptz,
  ADD COLUMN IF NOT EXISTS bouw7_sync_status    text,
  ADD COLUMN IF NOT EXISTS sync_vergrendeld     boolean DEFAULT false NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contactpersonen_bouw7_id_idx
  ON contactpersonen (bouw7_id) WHERE bouw7_id IS NOT NULL;

-- Voeg sync-vergrendeling toe aan relaties
ALTER TABLE relaties
  ADD COLUMN IF NOT EXISTS sync_vergrendeld boolean DEFAULT false NOT NULL;
