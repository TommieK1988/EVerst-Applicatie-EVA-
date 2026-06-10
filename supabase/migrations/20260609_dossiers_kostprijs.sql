-- calculator_id: rol-veld (was al in gebruik maar ontbrak als formele migratie)
-- kostprijs_excl_btw: gecalculeerde kostprijs vanuit Bouw7-offerte (excl. AK/winst/commissie)
ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS calculator_id      uuid REFERENCES public.medewerkers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kostprijs_excl_btw numeric(12,2);

CREATE INDEX IF NOT EXISTS dossiers_calculator_idx ON public.dossiers (calculator_id) WHERE calculator_id IS NOT NULL;
