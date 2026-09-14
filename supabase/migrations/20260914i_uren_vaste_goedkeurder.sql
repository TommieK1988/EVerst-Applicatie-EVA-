-- Vaste urengoedkeurder per medewerker.
--
-- De goedkeurketen voor Bouw7-uren loopt normaal via het DOSSIER: eerst de teamleider,
-- daarna de projectleider (zie lib/uren/bouw7-goedkeuring.ts). Dat werkt voor de
-- buitendienst, maar niet voor kantoor: een calculator of werkvoorbereider boekt op
-- van alles, en zijn uren horen bij zijn eigen leidinggevende -- niet bij de
-- projectleider van het dossier waar hij die middag aan rekende.
--
-- Staat hier iemand ingevuld, dan VERVANGT die de hele dossierroute voor alle uren van
-- deze medewerker: de teamleider en de projectleider van het dossier komen er niet meer
-- aan te pas. Leeg = de gewone route.
alter table public.medewerkers
  add column if not exists uren_goedkeurder_id uuid
    references public.medewerkers(id) on delete set null;

comment on column public.medewerkers.uren_goedkeurder_id is
  'Vaste goedkeurder van de uren van deze medewerker; vervangt de teamleider/projectleider-route van het dossier. Leeg = via het dossier.';

-- De routeringslaag zoekt per medewerker; de omgekeerde weg (wiens uren keur ik?) loopt
-- via deze kolom en verdient een index.
create index if not exists medewerkers_uren_goedkeurder_idx
  on public.medewerkers (uren_goedkeurder_id)
  where uren_goedkeurder_id is not null;
