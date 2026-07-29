-- Changelog: houtrot-locatie als boomstructuur (livegang 2026-07-30).
-- Toegepast op productie via de Supabase MCP op het moment van livegang op main.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-30','verbeterd','Houtrot','Houtrot-locatie als boomstructuur',
   'Je richt de locatie van een houtrotdossier nu in als boom — bijvoorbeeld Gevelzijde → Etage → Huisnummer — in plaats van losse lijstjes. Bouw de structuur met knoppen en genereer in één keer een reeks (bijvoorbeeld huisnummers 491 t/m 509) of plak een lijst. In de app kiest de vakman de locatie via keuzelijsten die op elkaar aansluiten: laag 2 toont alleen wat onder de gekozen laag 1 hangt, zodat onmogelijke combinaties niet meer voorkomen.');
