-- =====================================================================
-- Oplevering — ruwe tokenlink bewaren zodat hij herbruikbaar is
-- =====================================================================
-- Tot nu toe werd alleen de sha-256-hash bewaard: de link bestond daarna
-- nergens meer en was dus niet opnieuw te tonen of te kopiëren. Deze links
-- zijn bewust 'iedereen met de link'-links zonder login, dus de ruwe token
-- naast de hash bewaren maakt het beveiligingsmodel niet zwakker; het maakt
-- de link alleen terugvindbaar in EVA. `token_hash` blijft de lookup-sleutel.

alter table public.oplever_toegang_tokens
  add column if not exists token_raw text;

comment on column public.oplever_toegang_tokens.token_raw is
  'Ruwe token, bewaard zodat de link in EVA opnieuw te tonen/kopiëren is. Validatie loopt via token_hash.';

comment on table public.oplever_toegang_tokens is
  'Tokens voor publieke tokenlinks (geen login): onderaannemer afmelden, opdrachtgever-akkoord en bewonersfeedback. token_hash is de lookup-sleutel; token_raw is bewaard om de link opnieuw te kunnen tonen.';
