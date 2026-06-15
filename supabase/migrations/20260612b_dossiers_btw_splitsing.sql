-- btw_splitsing: BTW per tarief uit de Bouw7-offerte.
-- Berekend uit de offerteregels (grondslag per tarief) plus de AK- en W&R-opslag
-- bij hun eigen BTW-tarief. Som van bedragen == bedrag_incl_btw - bedrag_excl_btw.
ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS btw_splitsing jsonb;

COMMENT ON COLUMN public.dossiers.btw_splitsing IS
  'BTW per tarief uit de Bouw7-offerte: [{label, percentage, grondslag, bedrag}] — incl. AK/W&R-grondslag';
