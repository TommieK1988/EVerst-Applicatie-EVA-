-- Changelog: Mijn acties filteren op toegewezen persoon (commit a0d1227d).
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-10-09','verbeterd','Acties','Mijn acties: filteren op persoon',
   'Mag je de acties van collega''s zien, dan staat er op Mijn acties nu een filter "Toegewezen aan". Kies één of meer personen, of "Niet toegewezen", en je ziet meteen wat er bij wie openstaat.');
