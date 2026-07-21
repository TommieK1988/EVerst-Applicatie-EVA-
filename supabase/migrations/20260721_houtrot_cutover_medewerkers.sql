-- Houtrot-cutover: eigen `profiles`-auth vervangen door EVA's `medewerkers`.
-- De standalone Houtrot-app is uitgezet; EVA is voortaan de enige UI.
-- Verliesloos toegepast: 0 registraties/foto's/toewijzingen/logs en geen enkel
-- project met een created_by, dus er viel niets te hermappen.
-- Toegepast op 2026-07-21 via de Supabase MCP (apply_migration).

-- 1) Houtrot maakt geen eigen profiel meer aan bij elke nieuwe auth-gebruiker.
drop trigger if exists htr_on_auth_user_created on auth.users;
drop function if exists public.htr_handle_new_user();

-- 2) Alle bestaande policies weg: die leunen allemaal op profiles.role.
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies where schemaname = 'houtrotherstel'
  loop
    execute format('drop policy if exists %I on houtrotherstel.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 3) View die op profiles joint weg (verderop herbouwd op medewerkers).
drop view if exists houtrotherstel.registraties_met_details;

-- 4) Eigenaar-FK's ompunten van houtrotherstel.profiles naar public.medewerkers.
do $$
declare r record;
begin
  for r in
    select con.conname, cl.relname as tabel
    from pg_constraint con
    join pg_class cl        on cl.oid  = con.conrelid
    join pg_namespace ns    on ns.oid  = cl.relnamespace
    join pg_class ref       on ref.oid = con.confrelid
    join pg_namespace refns on refns.oid = ref.relnamespace
    where con.contype = 'f'
      and ns.nspname = 'houtrotherstel'
      and refns.nspname = 'houtrotherstel'
      and ref.relname = 'profiles'
  loop
    execute format('alter table houtrotherstel.%I drop constraint %I', r.tabel, r.conname);
  end loop;
end $$;

alter table houtrotherstel.repair_registrations
  add constraint repair_registrations_user_id_fkey
  foreign key (user_id) references public.medewerkers(id) on delete restrict;

alter table houtrotherstel.projects
  add constraint projects_created_by_fkey
  foreign key (created_by) references public.medewerkers(id) on delete set null;

alter table houtrotherstel.project_user_assignments
  add constraint project_user_assignments_user_id_fkey
  foreign key (user_id) references public.medewerkers(id) on delete cascade;

alter table houtrotherstel.activity_logs
  add constraint activity_logs_user_id_fkey
  foreign key (user_id) references public.medewerkers(id) on delete set null;

-- 5) profiles zelf weg.
drop table if exists houtrotherstel.profiles cascade;

-- 6) View herbouwd: medewerkersnaam i.p.v. profielnaam. Deze view joint over de
--    schema's heen en is daarmee de enige plek waar de naam van de registrant
--    beschikbaar is (PostgREST kan vanuit het houtrotherstel-schema niet naar
--    public.medewerkers embedden).
create view houtrotherstel.registraties_met_details as
select
  rr.*,
  p.name           as project_name,
  p.project_number,
  p.client_name,
  nullif(trim(concat_ws(' ', m.voornaam, m.tussenvoegsel, m.achternaam)), '') as medewerker_naam,
  m.email          as medewerker_email,
  sr.name          as standaard_reparatie_naam,
  sr.category      as reparatie_categorie,
  coalesce(rr.actual_sale_price,  rr.sale_price_snapshot)  as effectieve_verkoopprijs,
  coalesce(rr.actual_cost_price,  rr.cost_price_snapshot)  as effectieve_kostprijs,
  coalesce(rr.actual_labor_hours, rr.labor_hours_snapshot) as effectieve_arbeidsuren
from houtrotherstel.repair_registrations rr
left join houtrotherstel.projects        p  on rr.project_id        = p.id
left join public.medewerkers             m  on rr.user_id           = m.id
left join houtrotherstel.standard_repairs sr on rr.standard_repair_id = sr.id;

-- 7) Nieuwe RLS in EVA's lijn: alleen platformgebruikers, via is_platform_gebruiker().
do $$
declare t text;
begin
  foreach t in array array[
    'projects','project_user_assignments','standard_repairs',
    'standard_repair_materials','repair_registrations','repair_photos','activity_logs'
  ]
  loop
    execute format('alter table houtrotherstel.%I enable row level security', t);
    execute format(
      'create policy platform_gebruiker_toegang on houtrotherstel.%I for all to authenticated '
      || 'using (public.is_platform_gebruiker()) with check (public.is_platform_gebruiker())', t);
  end loop;
end $$;
