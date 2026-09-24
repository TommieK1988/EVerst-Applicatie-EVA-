-- Changelog: verlof uit het verleden blijft zichtbaar in de planning.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-24','opgelost','Planning','Verlof blijft zichtbaar als je terugbladert',
   'In de Medewerkerplanning en de planning van een dossier verdween verlof zodra de dag voorbij was. Blader je terug naar vorige weken, dan zie je nu weer wie er vrij was. Het verlof was nooit weg, het werd alleen niet meer getoond.');
