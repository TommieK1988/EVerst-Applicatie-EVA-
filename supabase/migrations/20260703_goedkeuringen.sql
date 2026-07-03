-- ─── Goedkeuringsworkflow: werkbegroting + offerte (controller-gate) ──────────
-- Generieke goedkeuringen met opmerkingen-thread, audit en delegatie, plus
-- regel-snapshots voor werkbegroting-goedkeuring op regelniveau en de kolommen
-- die de server-side gates (bestellingen, prognose, offerte-verzenden) nodig hebben.

-- ─── Generieke goedkeuringen ──────────────────────────────────────────────────

create table if not exists public.goedkeuringen (
  id                uuid primary key default gen_random_uuid(),
  object_type       text not null check (object_type in ('werkbegroting','offerte')),
  object_id         uuid not null,                        -- werkbegrotingen.id of quotes.id
  dossier_id        uuid references public.dossiers(id) on delete cascade,
  ronde             integer not null default 1,
  status            text not null default 'aangevraagd'
                    check (status in ('aangevraagd','goedgekeurd','afgekeurd','ingetrokken')),
  -- Offerte: hash van de inhoud op het goedkeurmoment (werkbegroting gebruikt de regel-snapshots).
  object_hash       text,
  toelichting       text,
  aangevraagd_door  uuid references public.medewerkers(id) on delete set null,
  aangevraagd_op    timestamptz not null default now(),
  beoordeeld_door   uuid references public.medewerkers(id) on delete set null,
  beoordeeld_op     timestamptz,
  gedelegeerd_aan   uuid references public.medewerkers(id) on delete set null,
  meekijkers        uuid[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Max één open aanvraag per object.
create unique index if not exists goedkeuringen_open_uniek
  on public.goedkeuringen (object_type, object_id) where status = 'aangevraagd';
create index if not exists goedkeuringen_object_idx  on public.goedkeuringen (object_type, object_id, ronde desc);
create index if not exists goedkeuringen_dossier_idx on public.goedkeuringen (dossier_id);

create table if not exists public.goedkeuring_opmerkingen (
  id              uuid primary key default gen_random_uuid(),
  goedkeuring_id  uuid not null references public.goedkeuringen(id) on delete cascade,
  medewerker_id   uuid references public.medewerkers(id) on delete set null,
  tekst           text not null,
  created_at      timestamptz not null default now()
);
create index if not exists goedkeuring_opmerkingen_idx on public.goedkeuring_opmerkingen (goedkeuring_id, created_at);

-- Audit: wie/wanneer/wat bij elke statuswijziging, delegatie of opmerking.
create table if not exists public.goedkeuring_gebeurtenissen (
  id              uuid primary key default gen_random_uuid(),
  goedkeuring_id  uuid not null references public.goedkeuringen(id) on delete cascade,
  actie           text not null check (actie in
                    ('aangevraagd','goedgekeurd','afgekeurd','ingetrokken','overgedragen','meekijker_toegevoegd','opmerking')),
  medewerker_id   uuid references public.medewerkers(id) on delete set null,
  detail          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists goedkeuring_gebeurtenissen_idx on public.goedkeuring_gebeurtenissen (goedkeuring_id, created_at);

-- ─── Regel-snapshot: welke werkbegroting-regels dekt een goedkeuring? ─────────
-- Geen FK op regel_id: een regel kan na de goedkeuring verwijderd zijn en dan
-- moet het snapshot juist bewaard blijven om het verschil te kunnen tonen.

create table if not exists public.werkbegroting_goedkeuring_regels (
  goedkeuring_id uuid not null references public.goedkeuringen(id) on delete cascade,
  regel_id       uuid not null,
  regel_hash     text not null,
  primary key (goedkeuring_id, regel_id)
);

-- ─── Uitbreidingen bestaande tabellen ─────────────────────────────────────────

-- Sync schreef is_verwijderd niet mee; server-side gates hebben het nodig.
alter table public.werkbegroting_regels      add column if not exists is_verwijderd boolean not null default false;
alter table public.werkbegroting_componenten add column if not exists is_verwijderd boolean not null default false;

-- Bestellingen: snapshot-hash van de componenten bij klaarzetten (verouderd-detectie).
alter table public.werkbegroting_bestellingen
  add column if not exists componenten_hash text,
  add column if not exists klaargezet_op    timestamptz,
  add column if not exists verzonden_op     timestamptz;

-- WB!-indicator op kanban-kaart en Informatie-tab (zelfde patroon als bouw7_uren_overschrijding).
alter table public.dossiers
  add column if not exists wb_ongeaccordeerde_wijzigingen boolean not null default false;

-- ─── FK-versoepeling voor dashboard-werkbegrotingen ───────────────────────────
-- OpdrachtWerkbegrotingTab gebruikt synthetische project-ids ("wb-direct-<dossierId>",
-- geen uuid, niet in projects). Sync stuurt daarvoor project_id = null; het anker
-- wordt dossier_id. Calculatiegroepen leven localStorage-first en staan niet
-- gegarandeerd in calculation_groups, dus ook die FK vervalt.

alter table public.werkbegrotingen drop constraint if exists werkbegrotingen_project_id_fkey;
alter table public.werkbegrotingen alter column project_id drop not null;
alter table public.werkbegrotingen add column if not exists dossier_id uuid references public.dossiers(id) on delete set null;
create index if not exists werkbegrotingen_dossier_idx on public.werkbegrotingen (dossier_id);

alter table public.werkbegroting_regels drop constraint if exists werkbegroting_regels_groep_id_fkey;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Lezen voor ingelogde gebruikers; alle schrijfacties lopen via server actions
-- met de admin-client (goedkeuren mag niet client-side afgedwongen kunnen worden).

alter table public.goedkeuringen                    enable row level security;
alter table public.goedkeuring_opmerkingen          enable row level security;
alter table public.goedkeuring_gebeurtenissen       enable row level security;
alter table public.werkbegroting_goedkeuring_regels enable row level security;

drop policy if exists "Lezen voor ingelogde gebruikers" on public.goedkeuringen;
create policy "Lezen voor ingelogde gebruikers" on public.goedkeuringen
  for select using (auth.uid() is not null);

drop policy if exists "Lezen voor ingelogde gebruikers" on public.goedkeuring_opmerkingen;
create policy "Lezen voor ingelogde gebruikers" on public.goedkeuring_opmerkingen
  for select using (auth.uid() is not null);

drop policy if exists "Lezen voor ingelogde gebruikers" on public.goedkeuring_gebeurtenissen;
create policy "Lezen voor ingelogde gebruikers" on public.goedkeuring_gebeurtenissen
  for select using (auth.uid() is not null);

drop policy if exists "Lezen voor ingelogde gebruikers" on public.werkbegroting_goedkeuring_regels;
create policy "Lezen voor ingelogde gebruikers" on public.werkbegroting_goedkeuring_regels
  for select using (auth.uid() is not null);

-- updated_at automatisch bijhouden.
create or replace function public.set_goedkeuring_updated_at()
returns trigger language plpgsql
set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_goedkeuringen_updated') then
    create trigger trg_goedkeuringen_updated
      before update on public.goedkeuringen
      for each row execute function public.set_goedkeuring_updated_at();
  end if;
end $$;
