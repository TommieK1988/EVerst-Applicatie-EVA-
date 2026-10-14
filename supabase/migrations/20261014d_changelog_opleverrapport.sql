-- Wat is nieuw: opleverrapport met grote foto's, goed uitgevoerde punten, opmerkingen en afspraken.
insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-14','verbeterd','Oplevering','Opleverrapport met grote foto''s en wat goed is gegaan',
   'Het opleverrapport toont per punt de foto vooraf, de foto na herstel en de omschrijving naast elkaar, in een flink formaat. Je kunt nu ook vastleggen wat goed is uitgevoerd (foto met korte omschrijving) en per oplevering algemene opmerkingen en afspraken toevoegen. Alles komt netjes in het rapport voor de klant.',
   'kantoor'),
  ('2026-10-14','nieuw','Oplevering','Goed uitgevoerd werk vastleggen',
   'Bij een oplevering kun je nu ook vastleggen wat goed is gegaan: maak een foto en schrijf of spreek kort in wat er gedaan is. Je kunt ook opmerkingen en afspraken invullen.',
   'mobiel');
