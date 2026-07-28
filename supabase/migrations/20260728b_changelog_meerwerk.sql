-- Changelog: meerwerk-vernieuwing (auto-import uit Bouw7, twee-weg bewerken,
-- automatische MW-nummering, bewakingscode bij akkoord, gekleurde status en
-- calculatie die zichzelf aanmaakt). Reeds live toegepast op 2026-07-28 via de
-- Supabase MCP; dit bestand is de repo-registratie ("items zijn altijd data").
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-28','verbeterd','Meerwerk','Meerwerk uit Bouw7 automatisch in EVA',
   'Meerwerkregels die in Bouw7 staan, verschijnen nu vanzelf in EVA — het aparte importblok onderaan de Meerwerk-tab is verdwenen. Wijzigingen die je in EVA maakt aan omschrijving, bedrag of factuurreferentie gaan automatisch terug naar Bouw7.'),
  ('2026-07-28','verbeterd','Meerwerk','Meerwerk overzichtelijker vastleggen',
   'Elke meerwerkregel krijgt automatisch een nummer (MW01, MW02, …). Zodra een regel op Akkoord komt, wordt daarmee de bewakingscode in Bouw7 aangemaakt, met de omschrijving als naam. De status kies je nu in één gekleurde keuzelijst, en met ''Calculatie'' maak je direct een meerwerk-offerte aan — ook als er nog geen calculatie op het dossier stond.');
