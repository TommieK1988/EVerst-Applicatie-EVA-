-- Houtrot verhuist van een eigen projectenlijst naar het dossier: registraties
-- horen bij een EVA-dossier en zijn zichtbaar zodra de dossier-toggle
-- `houtrot_registreren` voor dat dossier aanstaat.
--
-- Veilig toegepast op 2026-07-21 via de Supabase MCP: er waren nul registraties,
-- dus er viel niets te migreren.

alter table houtrotherstel.repair_registrations
  add column if not exists dossier_id uuid references public.dossiers(id) on delete cascade;

create index if not exists idx_htr_rr_dossier_id
  on houtrotherstel.repair_registrations(dossier_id);

-- Het oude houtrot-project is niet langer verplicht: registraties vanuit een
-- dossier hebben er geen. De kolom blijft staan voor de legacy-projectschermen.
alter table houtrotherstel.repair_registrations
  alter column project_id drop not null;

-- Een registratie hangt aan precies één anker: een dossier of een houtrot-project.
alter table houtrotherstel.repair_registrations
  drop constraint if exists rr_anker_check;
alter table houtrotherstel.repair_registrations
  add constraint rr_anker_check
  check (num_nonnulls(dossier_id, project_id) = 1);
