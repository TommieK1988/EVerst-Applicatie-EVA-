-- Wat is nieuw: periodebalk in de planning schuift per dag mee met het planbord.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-10-15','opgelost','Planning','Periodebalk schuift per dag mee met het planbord',
   'De periodebalk boven de planning bleef staan op het begin van de week of maand terwijl het planbord al verder was geschoven. Nu loopt de balk per dag mee, ook als je het planbord met de hand opzij schuift. Zo zie je altijd waar je in de tijd zit.');
