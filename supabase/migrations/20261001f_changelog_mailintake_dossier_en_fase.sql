-- Changelog: het gevonden dossier vult de velden, en EVA klikt de fase voor.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-10-01','verbeterd','Mailintake','Het behandelscherm vult meer zelf in',
   'Hoort de mail bij een bestaand dossier — meerwerk of een opdracht op een offerte — dan staat '
   || 'dat dossier nu bovenaan en vult het meteen de opdrachtgever, het werkadres, de categorie en '
   || 'de projectrollen. Wijkt de mail af van het dossier, dan kleurt dat veld oranje met beide '
   || 'waarden erbij. Verder staat de keuze aanvraag/opdracht/servicedesk niet meer standaard op '
   || 'Aanvraag: bij een opdracht of meerwerk zet EVA hem zelf op Opdracht. Klik je hem om, dan '
   || 'volgen de velden die keuze — bij een opdracht komen het opdrachtnummer, de opdrachtdatum en '
   || 'de termijnen in beeld, bij een aanvraag blijven die uit.');
