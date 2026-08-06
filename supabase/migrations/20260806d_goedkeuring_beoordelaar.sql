-- Goedkeuringen: expliciete beoordelaar per aanvraag.
--
-- De beoordelaar was tot nu toe impliciet: de controller van het dossier. Staat die
-- niet ingesteld — bij 546 van de 594 dossiers het geval — dan viel de controletaak
-- stil terug op een hardcoded medewerker en kreeg niemand een melding. De aanvrager
-- wijst nu zelf een beoordelaar uit de directie aan; die keuze staat hier vast, zodat
-- ook achteraf herleidbaar is bij wie een aanvraag lag.

alter table public.goedkeuringen
  add column if not exists beoordelaar_id uuid references public.medewerkers(id) on delete set null;

comment on column public.goedkeuringen.beoordelaar_id is
  'Medewerker aan wie deze aanvraag is gericht: de controller van het dossier, of — als het dossier er geen heeft — het door de aanvrager gekozen directielid.';

-- Voor "wat ligt er bij mij ter beoordeling": alleen de openstaande rondes doen ertoe.
create index if not exists goedkeuringen_beoordelaar_open_idx
  on public.goedkeuringen (beoordelaar_id)
  where status = 'aangevraagd';

-- Openstaande aanvragen van vóór deze wijziging: waar het dossier wél een controller
-- heeft, was dat impliciet al de beoordelaar — die vullen we alsnog in. De rest blijft
-- leeg; het paneel meldt dan eerlijk dat de aanvraag aan niemand gericht is.
update public.goedkeuringen g
   set beoordelaar_id = d.controller_id
  from public.dossiers d
 where d.id = g.dossier_id
   and g.status = 'aangevraagd'
   and g.beoordelaar_id is null
   and d.controller_id is not null;
