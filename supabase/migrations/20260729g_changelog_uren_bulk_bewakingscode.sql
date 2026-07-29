-- Changelog: uren in bulk verplaatsen naar een andere bewakingscode (livegang 2026-07-29).
-- Toegepast op productie via de Supabase MCP op het moment van livegang op main.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-29','verbeterd','Dossiers','Uren in één keer naar een andere bewakingscode verplaatsen',
   'Op de Uren-tab kun je nu meerdere regels aanvinken en ze in één handeling naar een andere bewakingscode verplaatsen, net zoals je dat al bij Inkoop kon. Handig om snel een reeks geboekte uren om te boeken zonder ze stuk voor stuk aan te passen.');
