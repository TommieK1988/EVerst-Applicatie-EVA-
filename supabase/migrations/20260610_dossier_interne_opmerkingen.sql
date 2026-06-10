-- Dossier: aparte EVA-opmerkingen (interne aanvullingen).
-- De bestaande kolom `opmerkingen` wordt door de Bouw7-sync gevuld en overschreven; deze
-- nieuwe kolom is EVA-eigen, wordt nooit door de sync aangeraakt en is altijd bewerkbaar.
ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS interne_opmerkingen text;
