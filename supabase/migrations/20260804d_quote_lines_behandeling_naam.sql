-- Naam van de schilderbehandeling apart bevriezen op de offerteregel.
--
-- `quote_lines.schilderbehandeling` bevat alleen de (uitgebreide) werkomschrijving.
-- De naam belandde tot nu toe uitsluitend achter `omschrijving` ("Kozijnen – 2-laags
-- dekkend") en was bij het renderen niet meer los te krijgen. Voor de offerte moet
-- de naam boven de behandelingstekst staan én onderstreept worden; daarvoor is hij
-- als eigen veld nodig.
--
-- Net als de tekst wordt de naam bevroren op het moment dat de offerte ontstaat, zodat
-- een latere wijziging in de bibliotheek een verstuurde offerte niet meer verandert.

alter table public.quote_lines
  add column if not exists schilderbehandeling_naam text;

comment on column public.quote_lines.schilderbehandeling_naam is
  'Bevroren naam van de gekoppelde schilderbehandeling (bibliotheek-naam op het moment van offerte-aanmaak).';
