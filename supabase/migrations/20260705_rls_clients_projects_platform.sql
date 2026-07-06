-- Sluit de laatste open EVA-tabellen: clients en projects (houtrotherstel-restanten;
-- de houtrot-kern-tabellen zoals repair_registrations/profiles bestaan niet meer in
-- de database). Op is_platform_gebruiker() gezet, consistent met de platform-baseline.
-- Enige verliezer is 1 los auth-account zonder medewerker-record (geen echte
-- kantoorgebruiker); de 8 platform-gebruikers behouden toegang.
--
-- Hiermee heeft GEEN enkele public-tabel nog een permissieve using(true)-policy.
do $$
declare t text;
begin
  foreach t in array array['clients','projects'] loop
    execute format('drop policy if exists auth_all on public.%I', t);
    execute format('drop policy if exists app_authenticated_all on public.%I', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists platform_gebruikers_all on public.%I', t);
    execute format('create policy platform_gebruikers_all on public.%I for all to authenticated using (is_platform_gebruiker()) with check (is_platform_gebruiker())', t);
  end loop;
end $$;
