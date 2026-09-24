-- Changelog: planitem verwijderen liep vast (bevestigingsvraag viel achter het venster).
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-24','opgelost','Planning','Planitem verwijderen loopt niet meer vast',
   'Wie in de medewerkerplanning een planitem wilde verwijderen, kwam vast te zitten: de vraag "Planitem verwijderen?" viel onzichtbaar achter het venster en je kon nergens meer op klikken. De vraag verschijnt nu gewoon bovenop, zodat verwijderen weer in één keer werkt. Dit geldt ook voor andere vensters met een bevestigingsvraag, zoals conflicten oplossen in de planning en de actielijsten.');
