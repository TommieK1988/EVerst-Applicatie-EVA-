-- RLS-aanscherping, tweede batch: gevoelige tabellen (PII, HR, secrets, management-
-- financiën) die per verificatie UITSLUITEND server-side via de admin/service-role
-- client worden gelezen. Zie 20260705_rls_sensitive_lockdown.sql voor de aanpak.
--
-- Verificatie vooraf: voor elk van deze tabellen is nagegaan dat geen enkele
-- browser-client én geen sessie-client (rol authenticated) ze leest — alle reads
-- lopen via createAdminClient(). De everts-calc-, taken-, forms- en houtrotherstel-
-- modules (die de sessie-client gebruiken) raken deze tabellen NIET.
--
-- Effect: permissieve authenticated-policies worden gedropt; RLS blijft aan, dus
-- REST-toegang met de anon-key/JWT levert 0 rijen. Service-role (server) bypast RLS.

do $$
declare
  r record;
  t text;
  gevoelig text[] := array[
    'integraties',                       -- bevat Bouw7 api_key (secret!)
    'contactpersonen', 'contactpersoon_organisaties', 'particulieren',
    'relatie_contacten', 'relatie_factuuradressen', 'relatie_inkoop',
    'medewerker_afdelingen', 'medewerker_afwezigheid',
    'medewerker_attribuut_definities', 'medewerker_attribuut_waarden',
    'medewerker_bedrijfsmiddelen', 'medewerker_bestanden', 'medewerker_functies',
    'medewerker_rooster_pauzes', 'medewerker_roosters', 'medewerker_skills',
    'management_ak', 'management_doelstellingen', 'management_maand_snapshot',
    'management_maand_snapshot_regel', 'management_ohw', 'management_projecten'
  ];
begin
  for r in
    select p.tablename, p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = any(gevoelig)
      and 'authenticated' = any(p.roles)
      and coalesce(p.qual, 'true') = 'true'
      and coalesce(p.with_check, 'true') = 'true'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;

  -- RLS expliciet aan borgen.
  foreach t in array gevoelig loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
