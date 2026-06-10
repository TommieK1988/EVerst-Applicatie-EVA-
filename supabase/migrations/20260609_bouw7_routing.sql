-- Voeg Bouw7 routing-velden toe aan dossiers
-- Hiermee kan elk dossier automatisch naar de juiste tab + kanban-kolom worden gerouteerd

ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS bouw7_projectstatus_id   integer,
  ADD COLUMN IF NOT EXISTS bouw7_projectstatus_naam  text,
  ADD COLUMN IF NOT EXISTS bouw7_categorie_id        integer,
  ADD COLUMN IF NOT EXISTS bouw7_categorie_naam      text,
  ADD COLUMN IF NOT EXISTS servicedesk_substatus     text;

-- Valideer de servicedesk substatus-waarden
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dossiers_servicedesk_substatus_check'
  ) THEN
    ALTER TABLE public.dossiers
      ADD CONSTRAINT dossiers_servicedesk_substatus_check
      CHECK (servicedesk_substatus IS NULL OR servicedesk_substatus IN (
        'nieuw',
        'mandaat_verhoging',
        'offerte_uitgebracht',
        'uitgezet',
        'ingepland',
        'loopt',
        'uitgevoerd',
        'kosten_compleet',
        'financieel_gereed'
      ));
  END IF;
END $$;

-- Index voor snelle routing-queries
CREATE INDEX IF NOT EXISTS dossiers_bouw7_projectstatus_naam_idx
  ON public.dossiers (bouw7_projectstatus_naam);

CREATE INDEX IF NOT EXISTS dossiers_bouw7_categorie_naam_idx
  ON public.dossiers (bouw7_categorie_naam);
