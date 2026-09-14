-- Standaard-goedkeurder voor niet-gewerkte uren.
--
-- Gewerkte uren volgen het dossier (teamleider -> projectleider). Niet-gewerkte uren (verlof,
-- ziek, vakantie, feestdag, tijd-voor-tijd) gaan naar de goedkeurder op het medewerkerprofiel.
-- Staat daar niemand, dan liep de regel tot nu toe alsnog via het dossier -- en dan komt iemands
-- vakantie terecht bij de projectleider van het project waarop die dag toevallig geboekt staat.
--
-- Vanaf nu is er een vaste terugval: één persoon die al het niet-gewerkte werk krijgt waarvoor
-- niets is ingesteld. Bewust een instelling en geen id in de code -- dit is een bedrijfsafspraak
-- die zonder release moet kunnen wijzigen.
--
-- Let op: dit is iets anders dan `terugval_goedkeurder_id`. Die hoort bij de EVA-weekstaat en bij
-- verlofaanvragen zonder pool; deze gaat alleen over de urenregels uit Bouw7.
alter table public.uren_instellingen
  add column if not exists niet_gewerkt_goedkeurder_id uuid
    references public.medewerkers(id) on delete set null;

comment on column public.uren_instellingen.niet_gewerkt_goedkeurder_id is
  'Goedkeurder van niet-gewerkte uren (verlof/ziek/vakantie/feestdag/tijd-voor-tijd) van medewerkers die zelf geen goedkeurder op hun profiel hebben staan.';

-- Robert Hoogenbosch; hij keurde deze uren in de praktijk al, als projectleider van de
-- indirecte-urenprojecten.
update public.uren_instellingen
   set niet_gewerkt_goedkeurder_id = (
     select id from public.medewerkers
      where voornaam = 'Robert' and achternaam = 'Hoogenbosch' and actief
      limit 1)
 where id = true
   and niet_gewerkt_goedkeurder_id is null;
