-- Extra velden voor de "Nieuwe aanvraag"-flow (aanmaken vanuit EVA → Bouw7).
--   dossiers.werkadres_huisnummer  — los huisnummer (Bouw7 heeft streetName + houseNumber apart)
--   dossiers.vve_code              — VvE-code (Bouw7 custom attribute caVveCode)
--   dossiers.aanvraagdatum         — datum van de aanvraag (default vandaag, bewerkbaar)
--   dossiers.deadline              — gewenste opleverdatum/deadline (optioneel)
-- bedrijfsgegevens.bouw7_branch_id — Bouw7 branch/vestiging-id van een werkmaatschappij,
--   zodat een nieuw project onder de juiste vestiging (en dus projectnummer-reeks) landt.

alter table public.dossiers
  add column if not exists werkadres_huisnummer text,
  add column if not exists vve_code             text,
  add column if not exists aanvraagdatum        date,
  add column if not exists deadline             date;

comment on column public.dossiers.werkadres_huisnummer is
  'Huisnummer (+ toevoeging) van het werkadres. Los veld: Bouw7 levert streetName en houseNumber apart.';
comment on column public.dossiers.vve_code is
  'VvE-code van het object. Gesynct naar Bouw7 als custom attribute caVveCode.';
comment on column public.dossiers.aanvraagdatum is
  'Datum van de aanvraag. Standaard vandaag bij aanmaken, handmatig bewerkbaar.';
comment on column public.dossiers.deadline is
  'Gewenste deadline/opleverdatum van de aanvraag (optioneel).';

alter table public.bedrijfsgegevens
  add column if not exists bouw7_branch_id integer;

comment on column public.bedrijfsgegevens.bouw7_branch_id is
  'Bouw7 branch/vestiging-id van deze werkmaatschappij (GET /list/branches). Bepaalt onder welke vestiging een nieuw project wordt aangemaakt (en daarmee de projectnummer-reeks). Leeg = matchen op naam.';
