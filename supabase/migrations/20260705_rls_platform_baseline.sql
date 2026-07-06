-- RLS-aanscherping, derde stap: alle resterende EVA-tabellen met een permissieve
-- `using(true)`-policy voor `authenticated` worden omgezet naar een policy die
-- alleen echte platform-gebruikers toelaat (is_platform_gebruiker()).
--
-- Context: op dit moment hebben ALLE ingelogde gebruikers gebruiker_type
-- 'platform_gebruiker' (8 stuks); er zijn nog geen monteur/app_gebruiker-logins.
-- Daarom is deze baseline veilig: alle huidige gebruikers behouden toegang, terwijl
-- anon en toekomstige niet-platform-accounts geweerd worden. Zodra de mobiele
-- veldwerker-login live gaat, worden voor taken/uren/klus-info fijnmazige
-- "eigen werk"-policies toegevoegd (eigenaar = auth.uid()), te testen met echte
-- monteur-accounts.
--
-- Uitgesloten:
--  * Houtrotherstel-tabellen — eigen auth-model (profiles.role), niet medewerkers.
--  * De reeds tot service-role afgeschermde gevoelige tabellen (batch 1 & 2) —
--    die hebben geen permissieve policy meer en blijven dus dicht.

do $$
declare
  r record;
  t text;
  uitgesloten text[] := array[
    -- Houtrotherstel (eigen auth-model)
    'profiles','clients','projects','project_user_assignments',
    'repair_photos','repair_registrations','activity_logs',
    'standard_repairs','standard_repair_materials','standard_repair_photos'
  ];
  te_beveiligen text[];
begin
  -- 1) Verzamel de tabellen met een volledig-permissieve authenticated-policy,
  --    minus de uitgesloten set.
  select array_agg(distinct p.tablename)
    into te_beveiligen
  from pg_policies p
  where p.schemaname = 'public'
    and 'authenticated' = any(p.roles)
    and coalesce(p.qual, 'true') = 'true'
    and coalesce(p.with_check, 'true') = 'true'
    and not (p.tablename = any(uitgesloten));

  -- 2) Drop die permissieve policies.
  for r in
    select p.tablename, p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and 'authenticated' = any(p.roles)
      and coalesce(p.qual, 'true') = 'true'
      and coalesce(p.with_check, 'true') = 'true'
      and not (p.tablename = any(uitgesloten))
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;

  -- 3) Zet per tabel één platform-policy + borg RLS.
  if te_beveiligen is not null then
    foreach t in array te_beveiligen loop
      execute format('alter table public.%I enable row level security', t);
      execute format(
        'create policy platform_gebruikers_all on public.%I for all to authenticated using (is_platform_gebruiker()) with check (is_platform_gebruiker())',
        t
      );
    end loop;
  end if;
end $$;
