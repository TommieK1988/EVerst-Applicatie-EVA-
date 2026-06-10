-- Rolvelden op dossiers: teamleider, werkvoorbereider, uitvoerder, controller
ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS teamleider_id      uuid REFERENCES public.medewerkers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS werkvoorbereider_id uuid REFERENCES public.medewerkers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uitvoerder_id       uuid REFERENCES public.medewerkers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS controller_id       uuid REFERENCES public.medewerkers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dossiers_teamleider_idx      ON public.dossiers (teamleider_id)      WHERE teamleider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dossiers_werkvoorbereider_idx ON public.dossiers (werkvoorbereider_id) WHERE werkvoorbereider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dossiers_uitvoerder_idx       ON public.dossiers (uitvoerder_id)       WHERE uitvoerder_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dossiers_controller_idx       ON public.dossiers (controller_id)       WHERE controller_id IS NOT NULL;
