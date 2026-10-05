-- Alleen voor EVA Mobiel: de verlofpagina toont nu ook het verlof uit de planning.
insert into public.changelog (datum, categorie, module, doelgroep, titel, omschrijving) values
  ('2026-10-05','verbeterd','Verlof','mobiel','Al je verlof in één overzicht',
   'Onder Verlof zie je nu al je vrije dagen, ook verlof dat kantoor voor je heeft ingepland. Zo weet je altijd wanneer je vrij bent.');
