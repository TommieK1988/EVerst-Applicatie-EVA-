-- Changelog: houtrot-app, locaties en de btw op de rapportage.
-- Toegevoegd nadat commit 9a6c34b7 op main stond (Vercel-productie).
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-11','verbeterd','Houtrot','Locaties kiezen in plaats van typen',
   'De projectleider stelt de locaties in op het dossier; in de app kiest de timmerman daaruit. '
   || 'Zelf typen kan niet meer, dus dezelfde plek heet overal hetzelfde. Staat een locatie eenmaal op '
   || 'een registratie, dan ligt hij vast. De niveaus heten standaard Straat, Gevel en Huisnummer, en je '
   || 'kunt locaties aan- of uitzetten zodat een lange huisnummerlijst behapbaar blijft.'),

  ('2026-09-11','verbeterd','Houtrot','Foto''s groter in de app',
   'In het overzicht staan de voor- en na-foto van een registratie als twee vierkante tegels naast '
   || 'elkaar, met het totaal van de tijdnormen erbij. Open je een registratie, dan staan de foto''s '
   || 'bovenaan over de volle breedte. Onderaan zie je wie de registratie maakte en wie hem het laatst '
   || 'bewerkte. Archiveren en verwijderen kan alleen nog op de desktop.'),

  ('2026-09-11','nieuw','Houtrot','Btw en werkzaamheden op de rapportage',
   'Het totaaloverzicht telt de werkzaamheden van alle registraties bij elkaar op: per soort werk het '
   || 'totale aantal, de eenheidsprijs, het btw-percentage en het regeltotaal. Onderaan staat het bedrag '
   || 'per btw-tarief en het totaal inclusief btw. Het btw-percentage komt uit de eenheidsprijs en kun je '
   || 'aanpassen per opdrachtgever en per dossier. Bij het opstellen kies je een rapportage met of zonder prijzen.');
