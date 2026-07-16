-- Materieelbeheer — historie per object
--
-- Doel: per stuk materieel terug kunnen zien wanneer en van/aan wie het is
-- overgedragen, en wat eerdere keuringen aan bijzonderheden, reparaties of
-- afkeuringen opleverden.
--
-- De tijdlijn wordt in de app SAMENGESTELD uit de bestaande bronnen
-- (toewijzingen, keuringen, onderhoud, controles, scans) — geen dubbele opslag,
-- dus de historie kan niet uit de pas lopen met de werkelijkheid. Twee gaten
-- vullen we hier:
--
--  1. Keuringen legden geen uitkomst vast — alleen een geldigheidsdatum. Zonder
--     uitkomst/bevindingen is een afkeuring achteraf niet terug te zien.
--  2. Statuswijzigingen (defect → onderhoud → beschikbaar) werden nergens
--     gelogd; de kolom werd simpelweg overschreven.
--
-- Additief: nieuwe kolommen + één nieuwe tabel.

-- 1) Keuringen: uitkomst + bijzonderheden + keurende partij
alter table public.materieel_keuringen
  add column if not exists uitkomst        text,
  add column if not exists bevindingen     text,
  add column if not exists uitgevoerd_door text;

comment on column public.materieel_keuringen.uitkomst is
  'goedgekeurd | voorwaardelijk | afgekeurd';
comment on column public.materieel_keuringen.bevindingen is
  'Bijzonderheden/opmerkingen van de keurmeester.';
comment on column public.materieel_keuringen.uitgevoerd_door is
  'Keurende partij/persoon (vrij tekstveld, vaak extern).';

-- 2) Statuswijzigingen en losse notities
create table if not exists public.materieel_gebeurtenissen (
  id           uuid primary key default gen_random_uuid(),
  object_id    uuid not null references public.materieel_objecten(id) on delete cascade,
  soort        text not null default 'status',   -- 'status' | 'notitie'
  omschrijving text,
  van          text,
  naar         text,
  door         uuid references public.medewerkers(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_materieel_gebeurtenissen_object
  on public.materieel_gebeurtenissen (object_id, created_at desc);

alter table public.materieel_gebeurtenissen enable row level security;
drop policy if exists platform_gebruikers_all on public.materieel_gebeurtenissen;
create policy platform_gebruikers_all on public.materieel_gebeurtenissen
  for all to authenticated using (is_platform_gebruiker()) with check (is_platform_gebruiker());
