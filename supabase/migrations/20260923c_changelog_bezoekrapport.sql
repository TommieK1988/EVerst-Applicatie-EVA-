-- Wat is nieuw: bezoekrapport neemt het projectbezoek van de mobiel volledig over.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-23','opgelost','Dossiers','Bezoekrapport toont weer je foto''s en opmerkingen',
   'Het bezoekrapport neemt nu alles over wat je op de mobiel bij een projectbezoek vastlegt: de overzichtsfoto''s, de foto''s bij de punten en je opmerkingen, zonder de tekst in te korten. Een oplevering komt niet meer in het bezoekrapport terecht; die heeft haar eigen rapport op de Oplevering-tab.'),

  ('2026-09-23','verbeterd','Dossiers','Projectbezoek afronden vraagt om een discipline',
   'Je kunt een projectbezoek pas afronden als je minstens één discipline hebt gekozen. Zo staat in het rapport altijd per vak wat je hebt gezien en hoe ver het werk is.');
