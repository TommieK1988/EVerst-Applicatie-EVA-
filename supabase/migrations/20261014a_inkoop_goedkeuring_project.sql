-- Goedkeurroute voor projectfacturen instelbaar (okt 2026).
--
-- Een projectfactuur (factuur met een EVA-dossier) gaat naar de eerste ingevulde dossierrol uit
-- `rollen`, in die volgorde. Standaard alleen de projectleider (zoals Bouw7 het deed). Projecten
-- krijgen een eigen drempel + tweede akkoord; de drempel in `inkoop_goedkeur_regels` geldt vanaf
-- nu alleen voor overhead. Eén rij (id = true). Gevoelig: geen RLS-policy, alleen service-role.

create table if not exists public.inkoop_goedkeur_project (
  id                      boolean primary key default true check (id),
  rollen                  text[] not null default array['projectleider']
                          check (array_length(rollen, 1) >= 1
                                 and rollen <@ array['projectleider', 'teamleider', 'calculator', 'controller', 'uitvoerder']),
  drempel_excl            numeric(12, 2) check (drempel_excl is null or drempel_excl >= 0),
  drempel_goedkeurder_id  uuid references public.medewerkers(id) on delete restrict,
  updated_at              timestamptz not null default now(),
  updated_by              uuid references public.medewerkers(id) on delete set null
);

comment on table public.inkoop_goedkeur_project is
  'Route voor projectfacturen: eerste ingevulde dossierrol uit `rollen`; boven drempel_excl een tweede akkoord (drempel_goedkeurder, leeg = Directie). Gevoelig: alleen service-role.';

insert into public.inkoop_goedkeur_project (id) values (true) on conflict (id) do nothing;

alter table public.inkoop_goedkeur_project enable row level security;

-- De stap onthoudt welke rol hem kreeg.
alter table public.inkoop_goedkeur_stappen drop constraint if exists inkoop_goedkeur_stappen_soort_check;
alter table public.inkoop_goedkeur_stappen add constraint inkoop_goedkeur_stappen_soort_check
  check (soort in ('projectleider', 'teamleider', 'calculator', 'controller', 'uitvoerder',
                   'grootboek', 'terugval', 'drempel'));

comment on column public.inkoop_goedkeur_regels.drempel_excl is
  'Drempel voor OVERHEAD (facturen zonder dossier). Projectfacturen gebruiken inkoop_goedkeur_project.drempel_excl.';
