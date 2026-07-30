-- Changelog: dossier opent vanzelf op locatie (mobiel).
-- Toegepast op productie via Supabase MCP bij livegang op main.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-30','nieuw','Dossiers','Dossier opent vanzelf op je locatie',
   'Open je op de telefoon de EVA-app terwijl je op een werkadres bent, dan opent het bijbehorende dossier automatisch — je hoeft het niet meer op te zoeken. Staan er meerdere van jouw dossiers op dezelfde plek, dan krijg je een kort lijstje om uit te kiezen. Uit te zetten via Mijn gegevens.');
