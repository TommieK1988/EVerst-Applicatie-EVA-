-- Bouw7 "Days Off" → verlof/capaciteit.

-- 1. medewerker_afwezigheid: herkomst + Bouw7-koppeling voor idempotente sync.
alter table public.medewerker_afwezigheid
  add column if not exists bouw7_id text,
  add column if not exists bron text not null default 'eva',
  add column if not exists bouw7_status int;

comment on column public.medewerker_afwezigheid.bron is
  'Herkomst: eva = handmatig ingevoerd, bouw7 = gesynct uit Bouw7 days-off-per-employee (read-only in EVA).';
comment on column public.medewerker_afwezigheid.bouw7_id is
  'Bouw7 dayOffPerEmployee-id; uniek per Bouw7-verlofregel (voor upsert/prune).';

-- Plain unique index: NULLs (bron='eva') zijn distinct → onbeperkt toegestaan; ON CONFLICT
-- (bouw7_id) infereert correct bij de upsert (een partieel index gaf inference-problemen).
create unique index if not exists medewerker_afwezigheid_bouw7_id_uidx
  on public.medewerker_afwezigheid (bouw7_id);

-- 2. Organisatiebrede vrije dagen (feestdagen / bouwvak) uit Bouw7 /list/days-off.
create table if not exists public.bouw7_vrije_dagen (
  id                 uuid primary key default gen_random_uuid(),
  bouw7_id           text unique not null,
  start_datum        date not null,
  eind_datum         date not null,
  naam               text,
  herhaalt_jaarlijks boolean not null default false,
  bouw7_laatst_sync  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint bouw7_vrije_dagen_datumvolgorde check (eind_datum >= start_datum)
);

comment on table public.bouw7_vrije_dagen is
  'Organisatiebrede vrije dagen (feestdagen, bouwvak) gesynct uit Bouw7 /list/days-off; verlagen de capaciteit voor iedereen.';
