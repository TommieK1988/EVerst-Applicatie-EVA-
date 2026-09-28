-- Changelog: melding bij dubbel inplannen (detailplanning) en versleepbare vensters.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-28','nieuw','Planning','Melding als iemand dubbel ingepland staat',
   'Plan je in de detailplanning iemand in op een moment dat hij of zij al in een ander project staat, of verlof of ziekte heeft? Dan krijg je direct een melding met waar het mee botst. Het inplannen gaat gewoon door; je weet het alleen meteen.'),
  ('2026-09-28','verbeterd','Algemeen','Vensters opzij slepen',
   'Pak een venster vast aan de titelbalk en schuif het opzij, zodat je ziet wat eronder staat. Handig bij het bewerken van een planitem terwijl je de planning erachter wilt blijven zien.');
