-- Materieelbeheer — houders aanwijzen bij de factuurimport van 2026.
--
-- Bij het inlezen bleven vier namen onbeslist omdat ze op meerdere medewerkers
-- pasten of alleen als referentie op de factuur stonden (Chris, John, Mark, Rob).
-- Tom heeft ze op 17 sept 2026 aangewezen:
--   Chris, Mark en Rob  → Mitchel van Bentem
--   John                → Chimène Ouwehand
--
-- Terugdraaien kan door de betrokken objecten weer op algemeen gebruik te zetten
-- en de toewijzingsregels met deze opmerking te verwijderen.

with tom as (
  select id from public.medewerkers where voornaam = 'Tom' and achternaam = 'Kamminga' limit 1
), houder (sleutel, medewerker_id) as (
  select v.sleutel, m.id
  from (values
    ('FACT-384537-1',   'Mitchel', 'van Bentem'),   -- Flexpack (factuur 384537, "CHRIS")
    ('FACT-384537-2',   'Mitchel', 'van Bentem'),   -- Acculader CA 10.8-18.0
    ('FACT-385715-1',   'Mitchel', 'van Bentem'),   -- Rechte accuslijper DGE 25 ("CHRIS")
    ('FACT-388623-1',   'Mitchel', 'van Bentem'),   -- Accu boormachine DD 2G ("ROB")
    ('FACT-F2301989-1', 'Mitchel', 'van Bentem'),   -- Altrex Falco trap ("MARK")
    ('FACT-F2294394-1', 'Chimène', 'Ouwehand'),     -- Flex deltaschuurmachine ("JOHN")
    ('FACT-F2294394-2', 'Chimène', 'Ouwehand'),
    ('FACT-F2294394-3', 'Chimène', 'Ouwehand')
  ) as v(sleutel, voornaam, achternaam)
  join public.medewerkers m on m.voornaam = v.voornaam and m.achternaam = v.achternaam
), bijgewerkt as (
  update public.materieel_objecten o
     set toegewezen_medewerker_id = h.medewerker_id,
         toewijzing_niveau        = 'persoonlijk',
         status                   = 'in_gebruik'
    from houder h
   where o.details->>'import_sleutel' = h.sleutel
     and o.toegewezen_medewerker_id is null
  returning o.id, o.aankoopdatum, h.medewerker_id
)
insert into public.materieel_toewijzingen (object_id, niveau, medewerker_id, van, door, opmerking)
select b.id, 'persoonlijk'::materieel_toewijzing_niveau, b.medewerker_id,
       b.aankoopdatum::timestamptz, (select id from tom),
       'Houder aangewezen na het inlezen van de factuur; de naam op de factuur was niet eenduidig'
from bijgewerkt b;
