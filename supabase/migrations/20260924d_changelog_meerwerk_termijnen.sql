-- Wat is nieuw: meerwerktermijnen direct aangemaakt + termijnen apart of samen factureren.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-24','verbeterd','Meerwerk','Termijnen voor meerwerk direct aangemaakt',
   'Bij een meerwerkregel kies je nu "1 termijn 100%" of "Volg offerte termijnstaat". Is het meerwerk akkoord, dan staan de termijnen meteen klaar op de termijnstaat; wissel je van keuze, dan worden ze vanzelf aangepast.'),
  ('2026-09-24','nieuw','Financieel','Termijnen apart of samen factureren',
   'Vink je op de Verkoop-tab meerdere termijnen aan, dan kies je of ze samen op één conceptfactuur komen of elk op een eigen factuur.');
