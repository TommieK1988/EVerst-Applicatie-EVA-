-- Changelog: vensters in de detailplanning vallen niet meer achter de planning.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-28','opgelost','Planning','Vensters in de detailplanning weer volledig zichtbaar',
   'Bij het bewerken van een planitem, activiteit of fase in de detailplanning schoven de regels van de planning soms over het venster heen, waardoor de knoppen Annuleren en Opslaan wegvielen. De vensters staan nu altijd bovenop.');
