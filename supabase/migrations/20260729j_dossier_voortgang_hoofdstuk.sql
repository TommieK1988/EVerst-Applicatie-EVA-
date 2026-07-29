-- =====================================================================
-- Hoofdstuk-dimensie op de standopname per bewakingscode.
--
-- Bewakingscodes zijn NIET uniek per project: dezelfde code (bv. ".A") kan in meerdere
-- hoofdstukken voorkomen. Zonder hoofdstuk in de sleutel gold een handmatig ingevoerd
-- % gereed voor élke gelijk-benoemde code — en werd het via de Bouw7-write ook naar de
-- pslId's van alle hoofdstukken geschreven. Met hoofdstuk_id in de unieke sleutel blijft
-- de standopname beperkt tot de bewerkte regel.
-- =====================================================================

alter table public.dossier_voortgang
  add column if not exists hoofdstuk_id integer;

-- Unieke sleutel uitbreiden met hoofdstuk_id. NULLS NOT DISTINCT houdt de project-rijen
-- (bewakingscode + hoofdstuk_id NULL) gededupliceerd, net als voorheen.
drop index if exists dv_uniek_idx;
create unique index dv_uniek_idx
  on public.dossier_voortgang (bouw7_id, niveau, bewakingscode, hoofdstuk_id) nulls not distinct;
