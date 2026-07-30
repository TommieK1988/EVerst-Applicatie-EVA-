-- Changelog: nieuwe actie aanmaken op mobiel (livegang 2026-07-30).
-- Toegepast op productie via de Supabase MCP op het moment van livegang op main.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-30','nieuw','Acties','Nieuwe actie aanmaken op je telefoon',
   'Je kunt nu ook vanaf je telefoon een nieuwe actie toevoegen. Geef de actie een titel, koppel hem eventueel aan een dossier, kies wie hem oppakt (standaard jijzelf) en stel prioriteit en een deadline in. De actie verschijnt meteen in je lijst met acties.');
