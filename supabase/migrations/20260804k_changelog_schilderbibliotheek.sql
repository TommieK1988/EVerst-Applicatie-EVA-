-- Changelog: schilderbibliotheek
--
-- Toegevoegd nadat het werk op `main` stond — de changelog-tabel staat in het
-- gedeelde productie-Supabase en toont elk item meteen aan iedereen.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-08-04','nieuw','Calculatie','Schilderbibliotheek gevuld met de onderhoudsnormen',
   'De volledige schildernormen staan nu in EVA: 91 behandelingen voor hout, kunststof, metaal en steenachtige ondergronden, met per onderdeel een tijdnorm en materiaalprijs. Kies een onderdeel, koppel er een behandeling aan en de uren en materiaalkosten komen automatisch mee. Bij elke behandeling staat de volledige werkomschrijving uit het OnderhoudNL Basisverf- en glasbestek.'),
  ('2026-08-04','nieuw','Calculatie','Materiaal gesplitst in verf en non-paints',
   'Bij schilderrecepten staan verfmaterialen en non-paints (kwasten, rollers, tape, afdekmateriaal) nu als aparte regels. Daarmee houdt de werkbegroting die twee gescheiden.'),
  ('2026-08-04','verbeterd','Calculatie','Beter zoeken naar een recept',
   'In de receptenzoeker mag je nu meerdere woorden door elkaar gebruiken: zoek op "kozijn ohd03" en je houdt alleen de kozijnvarianten binnen die behandeling over. Het maakt niet meer uit of je OHD03, OHD 03 of OHD-03 typt. De behandeling staat er ook bij in de lijst.'),
  ('2026-08-04','verbeterd','Calculatie','Schilderrecept koppelt voortaan de behandeling',
   'Voeg je een schilderrecept toe aan een calculatie, dan wordt de behandeling gekoppeld in plaats van de werkomschrijving gekopieerd. Werk je die behandeling later bij, dan schuiven lopende calculaties mee. De tekst ligt pas vast zodra de offerte verzonden wordt.'),
  ('2026-08-04','verbeterd','Calculatie','Schilderrecepten worden op één plek beheerd',
   'De schilderrecepten zijn ook zichtbaar in de receptenbibliotheek, maar daar alleen-lezen: ze worden beheerd in de Schilderwerkbibliotheek. Zo kunnen de twee lijsten niet uit elkaar lopen. Een wijziging in de Schilderwerkbibliotheek komt vanzelf op beide plekken terecht.');
