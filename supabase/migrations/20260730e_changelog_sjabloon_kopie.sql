-- Changelog-item: kopie van een documentsjabloon/offerte-layout krijgt een eigen Word-bestand.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-30','opgelost','Documenten','Een kopie van een sjabloon staat nu echt los',
   'Als je een documentsjabloon of offerte-layout kopieerde, bleven het origineel en de kopie hetzelfde Word-bestand gebruiken — je paste er dus twee tegelijk aan. Een kopie krijgt nu een eigen Word-bestand (en eigen briefpapier), zodat je die vrij kunt aanpassen zonder het origineel te raken.');
