-- Het houtrotherstel-schema bereikbaar maken via de PostgREST-API.
--
-- Zonder deze regel geeft de browser-client bij elke houtrot-call
-- "Invalid schema: houtrotherstel" (PGRST106) — de tabellen bestaan wél en de
-- RLS/rechten kloppen, maar het schema stond niet in de lijst van geëxposeerde
-- schema's (standaard alleen public, graphql_public). Dit was de werkelijke reden
-- dat de Houtrot-tab in het dossier niets deed.
--
-- De in-database config op de authenticator-rol overrulet de env-default en
-- overleeft een config-reload. Idempotent: SET zet de volledige lijst.
--
-- Toegepast op productie via de Supabase MCP op 2026-07-29.
--
-- LET OP: de canonieke plek is óók het dashboard (Settings → API → Exposed
-- schemas). Houd beide gelijk zodat een dashboard-wijziging deze waarde niet
-- per ongeluk terugdraait.

alter role authenticator set pgrst.db_schemas = 'public, graphql_public, houtrotherstel';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
