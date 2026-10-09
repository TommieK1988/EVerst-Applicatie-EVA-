-- Changelog: één binnengekomen mail in meerdere dossiers verwerken (commit 4d1cb411).
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-10-09','nieuw','Mailintake','Eén mail, meerdere dossiers',
   'Vraagt een opdrachtgever in één mail om werk op meerdere adressen, dan maak je er nu per adres een dossier van, elk met een eigen Bouw7-project. EVA zet de andere adressen al klaar en waarschuwt als je er toch één dossier van wilt maken; zo raakt een tweede adres niet meer zoek in de opmerkingen.');
