-- Welke dossierbestanden mogen in de mobiele app verschijnen.
-- Toegepast op 2026-07-22 via de Supabase MCP.
--
-- Bestanden komen read-only uit Bouw7, dus de keuze leggen we EVA-kant vast.
-- Bewust opt-in: alleen wat hier als zichtbaar staat, toont de app. De
-- buitendienst krijgt zo niet de hele projectmap op de telefoon.
create table if not exists public.dossier_bestand_app_zichtbaar (
  dossier_id       uuid   not null references public.dossiers(id) on delete cascade,
  bouw7_bestand_id bigint not null,
  zichtbaar        boolean not null default true,
  gewijzigd_op     timestamptz not null default now(),
  gewijzigd_door   uuid references public.medewerkers(id) on delete set null,
  primary key (dossier_id, bouw7_bestand_id)
);

create index if not exists idx_dossier_bestand_app_zichtbaar_dossier
  on public.dossier_bestand_app_zichtbaar(dossier_id) where zichtbaar;

alter table public.dossier_bestand_app_zichtbaar enable row level security;

drop policy if exists platform_gebruiker_toegang on public.dossier_bestand_app_zichtbaar;
create policy platform_gebruiker_toegang
  on public.dossier_bestand_app_zichtbaar
  for all to authenticated
  using (public.is_platform_gebruiker())
  with check (public.is_platform_gebruiker());

comment on table public.dossier_bestand_app_zichtbaar is
  'Opt-in: welke Bouw7-dossierbestanden zichtbaar zijn in de mobiele app. Geen rij = niet zichtbaar.';
