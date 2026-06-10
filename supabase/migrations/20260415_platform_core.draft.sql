-- =====================================================================
-- Everts Platform — Core migration (DRAFT — niet uitvoeren zonder review)
-- =====================================================================
-- Dit bestand is IDEMPOTENT: veilig om meerdere keren uit te voeren.
-- Gebruik DO-blokken met EXCEPTION handlers voor CREATE TYPE statements.
-- =====================================================================

-- =====================================================================
-- 0. EXTENSIES
-- =====================================================================
create extension if not exists pg_trgm with schema public;

-- =====================================================================
-- 1. INSTELLINGEN — Bedrijfsgegevens (single-row)
-- =====================================================================
create table if not exists public.bedrijfsgegevens (
  id              uuid primary key default gen_random_uuid(),
  naam            text not null,
  kvk_nummer      text,
  btw_nummer      text,
  iban            text,
  adres_straat    text,
  adres_postcode  text,
  adres_plaats    text,
  adres_land      text default 'Nederland',
  telefoon        text,
  email           text,
  website         text,
  logo_url        text,
  kleur_primair   text default '#0a7a35',
  kleur_accent    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =====================================================================
-- 2. RELATIES — Klanten / Leveranciers / Onderaannemers
-- =====================================================================
do $$ begin
  create type relatie_type as enum ('klant', 'leverancier', 'onderaannemer');
exception when duplicate_object then null;
end $$;

create table if not exists public.relaties (
  id                 uuid primary key default gen_random_uuid(),
  type               relatie_type not null,
  naam               text not null,
  kvk_nummer         text,
  btw_nummer         text,
  email              text,
  telefoon           text,
  website            text,
  adres_straat       text,
  adres_postcode     text,
  adres_plaats       text,
  adres_land         text default 'Nederland',
  opmerkingen        text,
  actief             boolean not null default true,
  kenmerken          jsonb not null default '{}'::jsonb,
  bouw7_id           text,
  bouw7_laatst_sync  timestamptz,
  bouw7_sync_status  text,
  bouw7_sync_fout    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id),
  unique (type, bouw7_id)
);

create index if not exists relaties_type_idx       on public.relaties (type) where actief;
create index if not exists relaties_bouw7_idx      on public.relaties (bouw7_id) where bouw7_id is not null;
create index if not exists relaties_naam_trgm_idx  on public.relaties using gin (naam gin_trgm_ops);

create table if not exists public.relatie_contacten (
  id             uuid primary key default gen_random_uuid(),
  relatie_id     uuid not null references public.relaties(id) on delete cascade,
  naam           text not null,
  functie        text,
  email          text,
  telefoon       text,
  is_primair     boolean not null default false,
  opmerkingen    text,
  bouw7_id       text,
  bouw7_laatst_sync timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists relatie_contacten_relatie_idx on public.relatie_contacten (relatie_id);

-- =====================================================================
-- 3. MEDEWERKERS
-- =====================================================================
create table if not exists public.medewerkers (
  id                 uuid primary key default gen_random_uuid(),
  voornaam           text not null,
  tussenvoegsel      text,
  achternaam         text not null,
  email              text,
  telefoon           text,
  foto_url           text,
  functie            text,
  afdeling           text,
  in_dienst_vanaf    date,
  uit_dienst_per     date,
  extern             boolean not null default false,
  actief             boolean not null default true,
  uurtarief_verkoop  numeric(10,2),
  uurtarief_kostprijs numeric(10,2),
  cao_schaal         text,
  auth_user_id       uuid references auth.users(id) on delete set null,
  bouw7_id           text unique,
  bouw7_laatst_sync  timestamptz,
  bouw7_sync_status  text,
  bouw7_sync_fout    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists medewerkers_actief_idx    on public.medewerkers (actief) where actief;
create index if not exists medewerkers_auth_user_idx on public.medewerkers (auth_user_id) where auth_user_id is not null;

-- =====================================================================
-- 4. INTEGRATIE-INSTELLINGEN
-- =====================================================================
create table if not exists public.integraties (
  id              uuid primary key default gen_random_uuid(),
  naam            text not null unique,
  actief          boolean not null default false,
  config          jsonb not null default '{}'::jsonb,
  laatst_sync     timestamptz,
  laatst_sync_status text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.sync_log (
  id              bigserial primary key,
  integratie      text not null,
  entiteit        text not null,
  richting        text not null,
  aantal_nieuw    integer not null default 0,
  aantal_bijgewerkt integer not null default 0,
  aantal_fout     integer not null default 0,
  duur_ms         integer,
  fout_melding    text,
  uitgevoerd_op   timestamptz not null default now()
);
create index if not exists sync_log_recent_idx on public.sync_log (integratie, uitgevoerd_op desc);

-- =====================================================================
-- 5. TRIGGERS — updated_at auto-bijwerken
-- =====================================================================
create or replace function public.tg_set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

do $$ begin
  perform 1 from pg_trigger where tgname = 'set_updated_at_bedrijfsgegevens';
  if not found then
    create trigger set_updated_at_bedrijfsgegevens  before update on public.bedrijfsgegevens   for each row execute function public.tg_set_updated_at();
    create trigger set_updated_at_relaties          before update on public.relaties           for each row execute function public.tg_set_updated_at();
    create trigger set_updated_at_relatie_contacten before update on public.relatie_contacten  for each row execute function public.tg_set_updated_at();
    create trigger set_updated_at_medewerkers       before update on public.medewerkers        for each row execute function public.tg_set_updated_at();
    create trigger set_updated_at_integraties       before update on public.integraties        for each row execute function public.tg_set_updated_at();
  end if;
end $$;

-- =====================================================================
-- 6. HOOFDPROCES — Aanvraag → Offerte → Opdracht status-model
-- =====================================================================

-- hoofdstatus: maak aan of voeg 'aanvraag' toe als die ontbreekt
do $$ begin
  create type hoofdstatus as enum ('aanvraag', 'offerte', 'opdracht');
exception when duplicate_object then null;
end $$;
alter type hoofdstatus add value if not exists 'aanvraag' before 'offerte';

-- aanvraag_substatus: volledig nieuw type
do $$ begin
  create type aanvraag_substatus as enum (
    'nieuw',
    'inlezen_aanvraag',
    'werkopname',
    'uitwerken_begroting',
    'controle_begroting',
    'offerte_gereed',
    'verzonden',
    'afgewezen',
    'vervallen'
  );
exception when duplicate_object then null;
end $$;

-- offerte_substatus: maak aan of voeg ontbrekende waarden toe
do $$ begin
  create type offerte_substatus as enum (
    'concept',
    'verzonden',
    'nabellen',
    'in_behandeling',
    'mondelinge_toezegging',
    'gewonnen',
    'verloren',
    'vervallen'
  );
exception when duplicate_object then null;
end $$;
alter type offerte_substatus add value if not exists 'concept';
alter type offerte_substatus add value if not exists 'nabellen';
alter type offerte_substatus add value if not exists 'in_behandeling';
alter type offerte_substatus add value if not exists 'mondelinge_toezegging';
alter type offerte_substatus add value if not exists 'gewonnen';
alter type offerte_substatus add value if not exists 'verloren';
alter type offerte_substatus add value if not exists 'vervallen';

-- opdracht_substatus
do $$ begin
  create type opdracht_substatus as enum (
    'nieuwe_opdracht',
    'werkvoorbereiding',
    'onderhanden',
    'uitvoering_gereed',
    'financieel_gereed',
    'financieel_afgesloten'
  );
exception when duplicate_object then null;
end $$;

-- dossiers tabel: maak aan (nieuwe schema) of pas bestaande tabel aan
create table if not exists public.dossiers (
  id                   uuid primary key default gen_random_uuid(),
  dossiernummer        text unique,
  titel                text not null,
  klant_id             uuid references public.relaties(id),
  hoofdstatus          hoofdstatus        not null default 'aanvraag',
  aanvraag_substatus   aanvraag_substatus          default 'nieuw',
  offerte_substatus    offerte_substatus,
  opdracht_substatus   opdracht_substatus,
  bedrag_excl_btw      numeric(12,2),
  verwacht_startdatum  date,
  verwacht_einddatum   date,
  project_manager_id   uuid references public.medewerkers(id),
  bouw7_id             text unique,
  bouw7_laatst_sync    timestamptz,
  bouw7_sync_status    text,
  bouw7_sync_fout      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references auth.users(id),
  constraint dossiers_status_consistent check (
    (hoofdstatus::text = 'aanvraag' and aanvraag_substatus is not null and offerte_substatus is null     and opdracht_substatus is null) or
    (hoofdstatus::text = 'offerte'  and aanvraag_substatus is null     and offerte_substatus is not null  and opdracht_substatus is null) or
    (hoofdstatus::text = 'opdracht' and aanvraag_substatus is null     and offerte_substatus is null      and opdracht_substatus is not null)
  )
);

-- Voeg aanvraag_substatus kolom toe als de tabel al bestond met het oude schema
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dossiers' and column_name = 'aanvraag_substatus'
  ) then
    alter table public.dossiers add column aanvraag_substatus aanvraag_substatus default 'nieuw';
  end if;
end $$;

-- Verwijder de oude CHECK constraint als die bestaat (wordt hieronder vervangen)
do $$ begin
  alter table public.dossiers drop constraint if exists dossiers_status_consistent;
exception when others then null;
end $$;

-- Voeg nieuwe CHECK constraint toe.
-- Gebruik ::text vergelijking zodat nieuw toegevoegde enum-waarden ('aanvraag')
-- binnen dezelfde transactie gebruikt kunnen worden (PostgreSQL beperking).
do $$ begin
  alter table public.dossiers add constraint dossiers_status_consistent check (
    (hoofdstatus::text = 'aanvraag' and aanvraag_substatus is not null and offerte_substatus is null     and opdracht_substatus is null) or
    (hoofdstatus::text = 'offerte'  and aanvraag_substatus is null     and offerte_substatus is not null  and opdracht_substatus is null) or
    (hoofdstatus::text = 'opdracht' and aanvraag_substatus is null     and offerte_substatus is null      and opdracht_substatus is not null)
  );
exception when duplicate_object then null;
end $$;

create index if not exists dossiers_hoofdstatus_idx  on public.dossiers (hoofdstatus);
create index if not exists dossiers_klant_idx        on public.dossiers (klant_id);
create index if not exists dossiers_bouw7_idx        on public.dossiers (bouw7_id) where bouw7_id is not null;

-- Volledige status-historie
create table if not exists public.dossier_status_historie (
  id                       bigserial primary key,
  dossier_id               uuid not null references public.dossiers(id) on delete cascade,
  van_hoofdstatus          hoofdstatus,
  van_aanvraag_substatus   aanvraag_substatus,
  van_offerte_substatus    offerte_substatus,
  van_opdracht_substatus   opdracht_substatus,
  naar_hoofdstatus         hoofdstatus not null,
  naar_aanvraag_substatus  aanvraag_substatus,
  naar_offerte_substatus   offerte_substatus,
  naar_opdracht_substatus  opdracht_substatus,
  reden                    text,
  door_user_id             uuid references auth.users(id),
  op                       timestamptz not null default now()
);

-- Voeg ontbrekende kolommen toe aan dossier_status_historie als die al bestond
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dossier_status_historie' and column_name = 'van_aanvraag_substatus'
  ) then
    alter table public.dossier_status_historie
      add column van_aanvraag_substatus  aanvraag_substatus,
      add column naar_aanvraag_substatus aanvraag_substatus;
  end if;
end $$;

create index if not exists dossier_status_historie_dossier_idx
  on public.dossier_status_historie (dossier_id, op desc);

-- Trigger: fase-promotie + status-historie loggen
create or replace function public.tg_dossier_status_change() returns trigger as $$
begin
  -- Aanvraag verzonden → Offerte verzonden
  if new.hoofdstatus = 'aanvraag' and new.aanvraag_substatus = 'verzonden' then
    new.hoofdstatus        := 'offerte';
    new.aanvraag_substatus := null;
    new.offerte_substatus  := 'verzonden';
  end if;

  -- Offerte gewonnen → Opdracht nieuwe_opdracht
  if new.hoofdstatus = 'offerte' and new.offerte_substatus = 'gewonnen' then
    new.hoofdstatus        := 'opdracht';
    new.offerte_substatus  := null;
    new.opdracht_substatus := 'nieuwe_opdracht';
  end if;

  -- Statushistorie loggen bij elke wijziging
  if (old.hoofdstatus, old.aanvraag_substatus, old.offerte_substatus, old.opdracht_substatus) is distinct from
     (new.hoofdstatus, new.aanvraag_substatus, new.offerte_substatus, new.opdracht_substatus) then
    insert into public.dossier_status_historie (
      dossier_id,
      van_hoofdstatus,  van_aanvraag_substatus,  van_offerte_substatus,  van_opdracht_substatus,
      naar_hoofdstatus, naar_aanvraag_substatus, naar_offerte_substatus, naar_opdracht_substatus
    ) values (
      new.id,
      old.hoofdstatus,  old.aanvraag_substatus,  old.offerte_substatus,  old.opdracht_substatus,
      new.hoofdstatus,  new.aanvraag_substatus,  new.offerte_substatus,  new.opdracht_substatus
    );
  end if;
  return new;
end;
$$ language plpgsql;

do $$ begin
  perform 1 from pg_trigger where tgname = 'dossier_status_change';
  if not found then
    create trigger dossier_status_change
      before update on public.dossiers
      for each row execute function public.tg_dossier_status_change();
    create trigger set_updated_at_dossiers
      before update on public.dossiers
      for each row execute function public.tg_set_updated_at();
  end if;
end $$;

-- =====================================================================
-- 7. RLS — GEEN policies in deze draft
-- =====================================================================
-- @REVIEW: Row Level Security apart definiëren zodra @everts/auth-package
-- rollen/claims heeft. Voorlopig: tabellen alleen benaderbaar via
-- service_role_key vanuit de dashboard-app (server-side).
