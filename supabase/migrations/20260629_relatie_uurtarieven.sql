-- Verkoop-uurtarieven per relatie × uursoort — gesynct uit Bouw7.
--
-- Bron: Bouw7 contactveld "Uurtarief per uurtype". De Bouw7 hourType wordt gekoppeld aan
-- een EVA planning_uursoort via de bestaande koppeling planning_uursoorten.bouw7_id ↔
-- Bouw7 hourType.id (zie lib/bouw7/derive-stamdata.ts). Read-only in EVA (bron='bouw7').
--
-- Gebruikt als default verkooptarief voor regie-factuurregels op servicedesk-dossiers.

create table if not exists public.relatie_uurtarieven (
  id                 uuid primary key default gen_random_uuid(),
  relatie_id         uuid not null references public.relaties(id) on delete cascade,
  uursoort_id        uuid not null references public.planning_uursoorten(id) on delete cascade,
  tarief_verkoop     numeric(10,2),
  tarief_kostprijs   numeric(10,2),
  bouw7_hourtype_id  text,
  bron               text not null default 'bouw7',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (relatie_id, uursoort_id)
);

create index if not exists idx_relatie_uurtarieven_relatie on public.relatie_uurtarieven(relatie_id);

comment on table public.relatie_uurtarieven is
  'Verkoop-/kostprijs-uurtarief per relatie × uursoort, gesynct uit Bouw7 contact ("Uurtarief per uurtype"). Read-only in EVA.';

-- RLS-basislijn conform 20260616c.
alter table public.relatie_uurtarieven enable row level security;
drop policy if exists app_authenticated_all on public.relatie_uurtarieven;
create policy app_authenticated_all on public.relatie_uurtarieven
  for all to authenticated using (true) with check (true);
