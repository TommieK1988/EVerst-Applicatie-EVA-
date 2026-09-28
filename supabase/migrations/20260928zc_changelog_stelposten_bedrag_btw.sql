-- Changelog: bedrag en BTW% van stelposten bewerkbaar.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-28','verbeterd','Dossiers','Bedrag en BTW van stelposten aanpassen',
   'In het overzicht van de stelposten (Informatie, Financiële totalen) pas je het bedrag nu direct aan, ook bij stelposten die uit de offerte komen. Per stelpost kies je ook het BTW-tarief; dat tarief gaat mee als je de stelpost later verrekent.');
