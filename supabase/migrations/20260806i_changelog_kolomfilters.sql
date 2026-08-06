-- Changelog-item: kolomfilters in de lijstweergaven leverden 0 rijen op.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-08-06','opgelost','Overzichten','Filteren in de lijsten werkt weer',
   'In de lijstweergaven leverde het aanvinken van een status of fase altijd "Geen resultaten" op, terwijl die statussen wel in de lijst stonden. Filteren op status, fase, facturatiemethode, relatietype en het debiteurenstoplicht werkt nu gewoon, en bij de formulieren en het foutenlog zijn de lege keuzelijsten gevuld. In de Excel-export staat voortaan het label in plaats van een interne code.');
