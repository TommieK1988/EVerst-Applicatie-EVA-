-- Rechten voor de inkoopfacturen-module.
--
-- Twee keys (zie RECHTEN_MODULES in packages/database/src/platform-types.ts):
--   inkoopfacturen       lezen = overzicht + eigen werkvoorraad
--                        schrijven = accorderen/afkeuren + opmerkingen
--                        beheren = betaalrondes samenstellen, vrijgeven, afronden
--   inkoopfacturen_alle  scope-schakelaar (zoals alle_taken). Zonder: alleen facturen die aan
--                        een project hangen, plus de facturen waarvan jij zelf goedkeurder bent.
--                        Mét: ook de facturen zonder project (overhead, abonnementen, leasing).
--
-- Deze seed is bewust krap. Uitgangspunt was de werkelijke verdeling van de 144 openstaande
-- goedkeuringen op 8 september 2026: alle goedkeurders zitten in Directie (96) of Projectbureau
-- (46). In Uitvoering en Ondersteunend staat geen enkele factuur open.
--
--   Directie       beheren + alle   — keurt goed én stelt de betaalronde samen
--   Projectbureau  schrijven        — keurt de projectgebonden facturen goed
--   Ondersteunend  lezen            — administratie kan meekijken en exporteren
--   Uitvoering     (niets)          — daar keurt vandaag niemand goed
--
-- Facturen zonder project bevatten overhead: leasecontracten, abonnementen, juridische en
-- verzekeringsposten. Alleen Directie krijgt die standaard te zien. Moet iemand anders erbij,
-- dan is dat één vinkje in Instellingen -> Gebruikers (afdelingsstandaard of persoonlijke
-- override) — geen migratie.

update public.medewerker_afdelingen
set standaard_rechten = coalesce(standaard_rechten, '{}'::jsonb)
  || jsonb_build_object('inkoopfacturen', 'beheren', 'inkoopfacturen_alle', 'lezen')
where actief and naam = 'Directie';

update public.medewerker_afdelingen
set standaard_rechten = coalesce(standaard_rechten, '{}'::jsonb)
  || jsonb_build_object('inkoopfacturen', 'schrijven')
where actief and naam = 'Projectbureau';

update public.medewerker_afdelingen
set standaard_rechten = coalesce(standaard_rechten, '{}'::jsonb)
  || jsonb_build_object('inkoopfacturen', 'lezen')
where actief and naam = 'Ondersteunend';
