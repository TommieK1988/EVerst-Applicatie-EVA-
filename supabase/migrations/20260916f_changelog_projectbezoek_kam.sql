-- Changelog: projectbezoeken terug te vinden en te bewerken op de desktop.
-- Toegevoegd nadat de wijziging op `main` stond; elk gepubliceerd item is meteen
-- voor iedereen zichtbaar.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-16','nieuw','Dossiers','Projectbezoeken staan nu op de KAM/VGM-tab',
   'Op het tabblad KAM/VGM vind je voortaan alle projectbezoeken van een opdracht terug, met per '
   || 'bezoek de datum, wie het deed, de uitgevoerde disciplines met hun voortgang en hoeveel punten '
   || 'er zijn vastgelegd. Ook bezoeken die nog niet zijn afgerond staan erbij, zodat je ziet wat er '
   || 'nog openstaat.'),

  ('2026-09-16','nieuw','Dossiers','Een projectbezoek aanvullen vanaf je computer',
   'Je hoeft een projectbezoek niet meer op je telefoon af te maken. Klik op een bezoek en je kunt '
   || 'er vanaf je computer disciplines, punten, foto''s en percentages aan toevoegen en het daarna '
   || 'afronden. Een al afgerond bezoek kun je met een reden heropenen als er nog iets bij moet.');
