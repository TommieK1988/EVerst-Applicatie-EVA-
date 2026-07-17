-- Changelog: rechten-formulier toont huidige rechten (fix op main sinds 2026-07-17).
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-17','opgelost','Medewerkers','Rechten aanpassen toont nu de huidige rechten',
   'Bij het aanpassen van de rechten van een medewerker stond voorheen alles op "Geen", ook als de medewerker via de afdeling wél rechten had. Het formulier opent nu met de rechten die op dat moment gelden, zodat je alleen hoeft te wijzigen wat anders moet.');
