-- Changelog: handtekeningplaatjes stellen geen dossiers meer voor in Postvak.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-28','opgelost','Postvak','Minder onterechte dossiervoorstellen bij het beoordelen van mail',
   'Postvak stelde soms dossiers voor die niets met de mail te maken hadden, met de reden "Een identieke bijlage hangt al aan dit dossier". Dat kwam door logo''s en handtekeningplaatjes, die in elke mail van een afzender hetzelfde zijn. Die tellen nu niet meer mee: alleen echte stukken zoals een opdrachtbon of tekening kunnen nog een dossier aanwijzen.');
