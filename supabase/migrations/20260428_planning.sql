-- =====================================================================
-- Everts Platform — Planning-module migratie
-- =====================================================================
-- Idempotent: veilig om meerdere keren uit te voeren.
-- Bouwt bovenop platform_core.draft.sql (medewerkers, dossiers, relaties).
-- =====================================================================

-- =====================================================================
-- 1. ENUM TYPES
-- =====================================================================

do $$ begin
  create type planning_taak_status as enum (
    'backlog', 'gepland', 'in_uitvoering', 'opgeleverd', 'on_hold'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type planning_entry_status as enum (
    'gepland', 'in_uitvoering', 'opgeleverd', 'afgemeld'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type medewerker_afwezigheid_type as enum (
    'verlof', 'ziek', 'training', 'overig'
  );
exception when duplicate_object then null;
end $$;

-- =====================================================================
-- 2. DOSSIER — koppeling naar everts-calc project (voor werkbegroting-sync)
-- =====================================================================
-- Geen FK-constraint: everts_calc migrations draaien in een aparte file.
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dossiers'
      and column_name = 'everts_calc_project_id'
  ) then
    alter table public.dossiers
      add column everts_calc_project_id uuid;
    comment on column public.dossiers.everts_calc_project_id
      is 'Verwijst naar projects.id in everts-calc (geen FK — andere migration-set).';
  end if;
end $$;

-- =====================================================================
-- 3. PLANNING — UURSOORTEN (catalogus)
-- =====================================================================
create table if not exists public.planning_uursoorten (
  id                          uuid primary key default gen_random_uuid(),
  naam                        text not null,
  code                        text not null,
  kleur                       text not null default '#2d7d2d',
  -- everts-calc component omschrijvingen die mappen naar deze uursoort
  everts_calc_omschrijvingen  text[] not null default '{}',
  volgorde                    smallint not null default 0,
  actief                      boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint planning_uursoorten_code_unique unique (code),
  constraint planning_uursoorten_kleur_check check (kleur ~ '^#[0-9a-fA-F]{6}$')
);
create index if not exists planning_uursoorten_actief_idx
  on public.planning_uursoorten (volgorde) where actief;

-- =====================================================================
-- 4. PLANNING — WERKBEGROTING per dossier per uursoort
-- =====================================================================
create table if not exists public.planning_werkbegroting_regels (
  id            uuid primary key default gen_random_uuid(),
  dossier_id    uuid not null references public.dossiers(id) on delete cascade,
  uursoort_id   uuid not null references public.planning_uursoorten(id),
  begrote_uren  numeric(8,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint planning_werkbegroting_regels_unique unique (dossier_id, uursoort_id),
  constraint planning_werkbegroting_regels_uren_check check (begrote_uren >= 0)
);
create index if not exists planning_werkbegroting_dossier_idx
  on public.planning_werkbegroting_regels (dossier_id);

-- =====================================================================
-- 5. MEDEWERKER — WERKROOSTER
-- =====================================================================
create table if not exists public.medewerker_roosters (
  id                    uuid primary key default gen_random_uuid(),
  medewerker_id         uuid not null references public.medewerkers(id) on delete cascade,
  geldig_vanaf          date not null,
  geldig_tot            date,
  -- ISO weekdagen: 1=Ma, 2=Di, 3=Wo, 4=Do, 5=Vr, 6=Za, 7=Zo
  werkdagen             smallint[] not null,
  dagstart              time not null default '07:00',
  dageind               time not null default '16:00',
  contracturen_per_week numeric(5,2) not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint medewerker_roosters_datumvolgorde check (
    geldig_tot is null or geldig_tot >= geldig_vanaf
  ),
  constraint medewerker_roosters_tijdvolgorde check (dageind > dagstart),
  constraint medewerker_roosters_contracturen check (contracturen_per_week >= 0 and contracturen_per_week <= 80)
);
create index if not exists medewerker_roosters_medewerker_idx
  on public.medewerker_roosters (medewerker_id, geldig_vanaf desc);

-- =====================================================================
-- 6. MEDEWERKER — AFWEZIGHEID
-- =====================================================================
create table if not exists public.medewerker_afwezigheid (
  id            uuid primary key default gen_random_uuid(),
  medewerker_id uuid not null references public.medewerkers(id) on delete cascade,
  type          medewerker_afwezigheid_type not null,
  start_datum   date not null,
  eind_datum    date not null,
  opmerking     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint medewerker_afwezigheid_datumvolgorde check (eind_datum >= start_datum)
);
create index if not exists medewerker_afwezigheid_periode_idx
  on public.medewerker_afwezigheid (medewerker_id, start_datum, eind_datum);

-- =====================================================================
-- 7. MEDEWERKER — SKILLS (vaardigheidstags)
-- =====================================================================
create table if not exists public.medewerker_skills (
  id            uuid primary key default gen_random_uuid(),
  medewerker_id uuid not null references public.medewerkers(id) on delete cascade,
  skill_naam    text not null,
  created_at    timestamptz not null default now(),
  constraint medewerker_skills_unique unique (medewerker_id, skill_naam)
);
create index if not exists medewerker_skills_medewerker_idx
  on public.medewerker_skills (medewerker_id);

-- =====================================================================
-- 8. PLANNING — TAKEN (planbare werkeenheden per dossier)
-- =====================================================================
create table if not exists public.planning_taken (
  id               uuid primary key default gen_random_uuid(),
  dossier_id       uuid not null references public.dossiers(id) on delete cascade,
  uursoort_id      uuid references public.planning_uursoorten(id),
  titel            text not null,
  omschrijving     text,
  geschatte_uren   numeric(8,2),
  -- Skills die vereist zijn (getoetst aan medewerker_skills.skill_naam)
  benodigde_skills text[] not null default '{}',
  gewenste_start   date,
  deadline         date,
  locatie_adres    text,
  onderaannemer_id uuid references public.relaties(id) on delete set null,
  status           planning_taak_status not null default 'backlog',
  volgorde         smallint not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint planning_taken_geschatte_uren_check check (
    geschatte_uren is null or geschatte_uren >= 0
  )
);
create index if not exists planning_taken_dossier_status_idx
  on public.planning_taken (dossier_id, status);
create index if not exists planning_taken_uursoort_idx
  on public.planning_taken (uursoort_id) where uursoort_id is not null;

-- =====================================================================
-- 9. PLANNING — ENTRIES (toewijzing medewerker × taak × tijdvak)
-- =====================================================================
create table if not exists public.planning_entries (
  id             uuid primary key default gen_random_uuid(),
  taak_id        uuid not null references public.planning_taken(id) on delete cascade,
  medewerker_id  uuid not null references public.medewerkers(id),
  start_dt       timestamptz not null,
  eind_dt        timestamptz not null,
  -- Gedenormaliseerd voor snelle queries; bijgewerkt door server action
  uren           numeric(5,2) not null,
  -- Werkbegroting-overschrijding met expliciete bevestiging
  overrule       boolean not null default false,
  overrule_reden text,
  overrule_door  uuid references auth.users(id),
  status         planning_entry_status not null default 'gepland',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint planning_entries_tijdvolgorde check (eind_dt > start_dt),
  constraint planning_entries_uren_check check (uren > 0),
  constraint planning_entries_overrule_reden check (
    overrule = false or overrule_reden is not null
  )
);
create index if not exists planning_entries_medewerker_periode_idx
  on public.planning_entries (medewerker_id, start_dt, eind_dt);
create index if not exists planning_entries_taak_idx
  on public.planning_entries (taak_id);
create index if not exists planning_entries_status_idx
  on public.planning_entries (status);

-- =====================================================================
-- 10. WERKBONNEN (uitvoeringsregistratie door monteur)
-- =====================================================================
create table if not exists public.werkbonnen (
  id                 uuid primary key default gen_random_uuid(),
  planning_entry_id  uuid not null references public.planning_entries(id),
  start_dt           timestamptz not null,
  eind_dt            timestamptz not null,
  gewerkte_uren      numeric(5,2) not null,
  opmerking          text,
  handtekening_url   text,
  klaar_gemeld_op    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint werkbonnen_tijdvolgorde check (eind_dt > start_dt),
  constraint werkbonnen_uren_check check (gewerkte_uren > 0)
);
create index if not exists werkbonnen_entry_idx
  on public.werkbonnen (planning_entry_id);

-- =====================================================================
-- 11. WERKBON FOTOS
-- =====================================================================
create table if not exists public.werkbon_fotos (
  id          uuid primary key default gen_random_uuid(),
  werkbon_id  uuid not null references public.werkbonnen(id) on delete cascade,
  storage_url text not null,
  gemaakt_op  timestamptz not null default now()
);
create index if not exists werkbon_fotos_werkbon_idx
  on public.werkbon_fotos (werkbon_id);

-- =====================================================================
-- 12. UREN REGELS (urenledger voor nacalculatie)
-- =====================================================================
create table if not exists public.uren_regels (
  id                 uuid primary key default gen_random_uuid(),
  werkbon_id         uuid not null references public.werkbonnen(id) on delete cascade,
  planning_entry_id  uuid references public.planning_entries(id),
  -- Gedenormaliseerd voor snelle groepering in rapportages
  dossier_id         uuid not null references public.dossiers(id),
  medewerker_id      uuid not null references public.medewerkers(id),
  uursoort_id        uuid references public.planning_uursoorten(id),
  datum              date not null,
  uren               numeric(5,2) not null,
  opmerking          text,
  created_at         timestamptz not null default now(),
  constraint uren_regels_uren_check check (uren > 0)
);
create index if not exists uren_regels_dossier_datum_idx
  on public.uren_regels (dossier_id, datum);
create index if not exists uren_regels_medewerker_datum_idx
  on public.uren_regels (medewerker_id, datum);

-- =====================================================================
-- 13. TRIGGERS — updated_at auto-bijwerken (zelfde patroon als platform_core)
-- =====================================================================
do $$ begin
  perform 1 from pg_trigger where tgname = 'set_updated_at_planning_uursoorten';
  if not found then
    create trigger set_updated_at_planning_uursoorten
      before update on public.planning_uursoorten
      for each row execute function public.tg_set_updated_at();

    create trigger set_updated_at_planning_werkbegroting_regels
      before update on public.planning_werkbegroting_regels
      for each row execute function public.tg_set_updated_at();

    create trigger set_updated_at_medewerker_roosters
      before update on public.medewerker_roosters
      for each row execute function public.tg_set_updated_at();

    create trigger set_updated_at_medewerker_afwezigheid
      before update on public.medewerker_afwezigheid
      for each row execute function public.tg_set_updated_at();

    create trigger set_updated_at_planning_taken
      before update on public.planning_taken
      for each row execute function public.tg_set_updated_at();

    create trigger set_updated_at_planning_entries
      before update on public.planning_entries
      for each row execute function public.tg_set_updated_at();

    create trigger set_updated_at_werkbonnen
      before update on public.werkbonnen
      for each row execute function public.tg_set_updated_at();
  end if;
end $$;
