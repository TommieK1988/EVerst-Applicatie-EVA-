-- contactpersoon_id: specifieke contactpersoon van de opdrachtgever voor dit dossier
ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS contactpersoon_id uuid
    REFERENCES public.contactpersonen(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dossiers_contactpersoon_idx
  ON public.dossiers (contactpersoon_id) WHERE contactpersoon_id IS NOT NULL;
