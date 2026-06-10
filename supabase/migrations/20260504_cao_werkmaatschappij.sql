ALTER TABLE cao_documenten
  ADD COLUMN IF NOT EXISTS werkmaatschappij_id uuid REFERENCES bedrijfsgegevens(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cao_documenten_werkmaatschappij_idx ON cao_documenten(werkmaatschappij_id);
