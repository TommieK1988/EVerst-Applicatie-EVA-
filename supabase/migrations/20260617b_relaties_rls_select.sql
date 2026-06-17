-- RLS SELECT-policy voor public.relaties
--
-- Probleem: op `relaties` stond RLS aan zónder enige policy. Daardoor kreeg de
-- sessie-client (anon-key + ingelogde gebruiker = rol `authenticated`) GEEN rijen terug.
-- Dat brak o.a. de relatie-zoeker in de werkbegroting (`zoekRelaties`), die als enige
-- `relaties` via de sessie-client leest: zoeken op leverancier/onderaannemer gaf altijd
-- 0 resultaten, ongeacht zoekterm of type.
--
-- Beleid:
--   - platform-gebruikers mogen ALLE relaties lezen (nodig voor zoeken/koppelen);
--   - app-gebruikers (mobiel) en anon krijgen de tabel NIET.
-- Schrijfacties blijven via de service-role (admin-client / Bouw7-sync); bewust geen write-policy.
-- Hergebruikt de bestaande SECURITY DEFINER-helper is_platform_gebruiker()
-- (zie 20260616b_medewerkers_rls_select.sql).

alter table public.relaties enable row level security;

drop policy if exists relaties_select on public.relaties;
create policy relaties_select on public.relaties
  for select
  to authenticated
  using (public.is_platform_gebruiker());
