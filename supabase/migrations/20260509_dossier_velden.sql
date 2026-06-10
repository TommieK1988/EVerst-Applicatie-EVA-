-- Dossier: categorie + werkadres contactvelden
ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS categorie          text,
  ADD COLUMN IF NOT EXISTS werkadres_naam     text,
  ADD COLUMN IF NOT EXISTS werkadres_telefoon text,
  ADD COLUMN IF NOT EXISTS werkadres_email    text,
  ADD COLUMN IF NOT EXISTS werkadres_straat   text,
  ADD COLUMN IF NOT EXISTS werkadres_postcode text,
  ADD COLUMN IF NOT EXISTS werkadres_stad     text;
