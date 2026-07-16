-- Mobiel nummer op medewerkers.
--
-- Bron voor {uitvoerder.mobiel} en de overige rol-blokken op documenten: een
-- bewonersbrief noemt wie er langskomt en hoe je die bereikt. relaties en
-- contactpersonen hadden al een mobiel-kolom; medewerkers niet.

alter table public.medewerkers add column if not exists mobiel text;

comment on column public.medewerkers.mobiel is
  'Mobiel nummer; bron voor {<rol>.mobiel} op documenten (bewonersbrief e.d.).';
