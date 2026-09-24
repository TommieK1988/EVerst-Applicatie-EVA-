-- Changelog: geldigheidstermijn van offertes bedrijfsbreed instelbaar.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-24','nieuw','Offertes','Geldigheidstermijn van offertes zelf instellen',
   'Onder EvertsCalc → Instellingen → Offerte instellingen leg je nu vast hoeveel dagen een offerte geldig is. Elke nieuwe offerte krijgt die termijn automatisch mee; per offerte kun je de datum daarna nog aanpassen.');
