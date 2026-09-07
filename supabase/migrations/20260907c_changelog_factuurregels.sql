-- Changelog-item: factuurregels samenstellen uit de geboekte uren en kosten.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-07','verbeterd','Facturatie','Zelf bepalen hoe regiewerk op de factuur komt',
   'Klik je bij een stelpost of regiepost op Aanpassen, dan zie je nu alle geboekte uren en kosten in een tabel. Je past per regel het uurtarief, de opslag of het bedrag aan, zet posten uit voor een volgende keer, en voegt regels samen tot één regel op de factuur. Ook het btw-tarief kies je per regel. Standaard staan uren en materiaal netjes uit elkaar.');
