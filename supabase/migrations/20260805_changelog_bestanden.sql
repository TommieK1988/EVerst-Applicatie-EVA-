-- Changelog-items voor de vernieuwde Bestanden-tab in het dossier.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-08-05', 'verbeterd', 'Dossiers', 'Alle bestanden van een dossier in één lijst',
   'Bouw7-bestanden en SharePoint-bestanden stonden in twee aparte tabellen, dus je moest twee keer zoeken. Nu staat alles in één lijst met een kolom die laat zien waar een bestand bewaard wordt, en kun je erin zoeken en sorteren. Foto''s staan niet meer als regel tussen de bestanden maar in een galerij ernaast, met een knop om ze op volledig scherm te bekijken. Sleep bestanden naar de lijst om ze in de SharePoint-map van het dossier te zetten.'),
  ('2026-08-05', 'nieuw', 'Dossiers', 'E-mails in het dossier direct lezen',
   'Een Outlook-bericht in het dossier hoef je niet meer eerst te downloaden en in Outlook te openen. Klik op Lezen en je ziet meteen de afzender, de ontvangers, de datum, de tekst en de bijlagen. Bijlagen kun je los opslaan.');
