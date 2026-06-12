-- bedrag_incl_btw: verkoopprijs incl. BTW uit Bouw7.
-- Bron is het offerte-totaal (quotation.total = verkoopprijs incl. BTW; quotation.subtotal = excl. BTW).
-- BTW-bedrag in de UI = bedrag_incl_btw - bedrag_excl_btw (klopt ook bij 9%, gemengd en BTW-verlegd).
ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS bedrag_incl_btw numeric(12,2);

COMMENT ON COLUMN public.dossiers.bedrag_incl_btw IS
  'Verkoopprijs incl. BTW uit Bouw7 (bron: quotation.total)';
