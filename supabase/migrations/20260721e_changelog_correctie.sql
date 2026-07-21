-- De balkenplanning toont geen uren meer: het urenveld uit Bouw7 staat bij een blok
-- met meerdere mensen als bloktotaal op ieders regel en is niet consequent gevuld.
-- Alleen de omschrijving bijwerken (niet aangemaakt_op), zodat het item niet opnieuw
-- als ongelezen bij iedereen opduikt.
update public.changelog
set omschrijving = 'De planning van een dossier staat op je telefoon nu op datum, met het eerstvolgende werk bovenaan. Werk dat al voorbij of afgerond is, staat achter de knop "Toon verlopen" zodat je lijst kort blijft. Draai je de telefoon een kwartslag, dan krijg je een overzichtelijke balkenplanning te zien, met per activiteit wie er staat ingepland.'
where datum = '2026-07-21' and module = 'Planning'
  and titel = 'Planning in het dossier op de telefoon: op volgorde van datum';
