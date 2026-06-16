-- RLS SELECT-policy voor public.medewerkers
--
-- Probleem: op `medewerkers` stond RLS aan zónder enige policy. Daardoor kreeg de
-- sessie-client (anon-key + ingelogde gebruiker = rol `authenticated`) GEEN rijen terug.
-- Dat brak o.a. het ophalen van het eigen medewerker-record (naam, afdeling, rechten),
-- waardoor het Management-tab verdween en rechten-instellingen geen effect leken te hebben.
--
-- Beleid:
--   - iedere ingelogde gebruiker mag de EIGEN rij lezen (auth_user_id = auth.uid());
--   - platform-gebruikers mogen ALLE medewerkers lezen (nodig voor lijsten/planning);
--   - app-gebruikers (mobiel) en anon krijgen NIET de hele tabel → BSN/salaris beschermd.
-- Schrijfacties blijven via de service-role (admin-client); er is bewust geen write-policy.

-- SECURITY DEFINER-helper: bepaalt of de huidige gebruiker een platform-gebruiker is.
-- Draait als owner en omzeilt RLS, zodat de policy hieronder geen oneindige recursie geeft.
create or replace function public.is_platform_gebruiker()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.medewerkers
    where auth_user_id = auth.uid()
      and gebruiker_type = 'platform_gebruiker'
      and actief = true
  );
$$;

grant execute on function public.is_platform_gebruiker() to authenticated;

alter table public.medewerkers enable row level security;

drop policy if exists medewerkers_select on public.medewerkers;
create policy medewerkers_select on public.medewerkers
  for select
  to authenticated
  using (
    auth_user_id = auth.uid()
    or public.is_platform_gebruiker()
  );
