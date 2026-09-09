-- is_platform_gebruiker() eenmalig evalueren in plaats van per rij -- 161 policies.
--
-- WAAROM: `is_platform_gebruiker()` is de RLS-muur die op vrijwel elke tabel staat. De
-- functie is STABLE, maar zonder subquery roept Postgres hem voor ELKE RIJ opnieuw aan.
-- En die functie doet zélf een select op `medewerkers`:
--
--   select exists (select 1 from public.medewerkers
--                  where auth_user_id = auth.uid() and gebruiker_type = 'platform_gebruiker'
--                    and actief = true)
--
-- Een query die duizend rijen teruggeeft draait die subquery dus duizend keer. Verpakt in
-- `(select ...)` wordt het een InitPlan: één keer per statement, ongeacht het aantal rijen.
--
-- Dit is de grootste post in deze database en de Supabase-linter mist hem: die kijkt alleen
-- naar `auth.uid()` en `current_setting()`, niet naar eigen STABLE functies.
--
-- VEILIG OMDAT: de conditie is in alle 161 gevallen letterlijk `is_platform_gebruiker()` --
-- geen samengestelde uitdrukkingen. Er zijn maar drie vormen:
--   149x  ALL     to authenticated   using + with check
--     9x  ALL     to public          using + with check
--     3x  SELECT  to authenticated   alleen using
-- Rol, commando en conditie blijven ongewijzigd; alleen de aanroep wordt verpakt.
-- RESTRICTIVE policies worden niet aangeraakt.
--
-- lock_timeout: het herschrijven van een policy vraagt kort een ACCESS EXCLUSIVE-lock op de
-- tabel. Dat is metadata-werk van milliseconden, maar zonder timeout zou zo'n lock achter
-- een lopende query kunnen gaan staan en dan blokkeert hij al het verkeer op die tabel.
-- Met een timeout faalt de migratie liever schoon dan dat hij EVA laat hangen.

set local lock_timeout = '3s';

do $$
declare
  r        record;
  rollen   text;
  doel     text;
  gedaan   int := 0;
begin
  for r in
    select schemaname, tablename, policyname, cmd, roles, with_check
    from pg_policies
    where schemaname = 'public'
      and permissive = 'PERMISSIVE'
      and qual = 'is_platform_gebruiker()'
      and cmd in ('ALL', 'SELECT')
      and (with_check is null or with_check = 'is_platform_gebruiker()')
    order by tablename, policyname
  loop
    doel := format('%I.%I', r.schemaname, r.tablename);

    -- `to public` is de standaard; die laten we weg in plaats van 'public' te quoten,
    -- want quote_ident maakt er "public" van en dat is een rolnaam die niet bestaat.
    if r.roles = '{public}'::name[] then
      rollen := '';
    else
      rollen := ' to ' || (select string_agg(quote_ident(x::text), ', ') from unnest(r.roles) as x);
    end if;

    execute format('drop policy %I on %s', r.policyname, doel);

    if r.cmd = 'ALL' and r.with_check is not null then
      execute format(
        'create policy %I on %s for all%s '
        'using ((select public.is_platform_gebruiker())) '
        'with check ((select public.is_platform_gebruiker()))',
        r.policyname, doel, rollen);
    elsif r.cmd = 'ALL' then
      execute format(
        'create policy %I on %s for all%s using ((select public.is_platform_gebruiker()))',
        r.policyname, doel, rollen);
    else
      execute format(
        'create policy %I on %s for select%s using ((select public.is_platform_gebruiker()))',
        r.policyname, doel, rollen);
    end if;

    gedaan := gedaan + 1;
  end loop;

  raise notice 'policies herschreven: %', gedaan;
end $$;
