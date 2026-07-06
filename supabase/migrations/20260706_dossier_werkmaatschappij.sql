-- Werkmaatschappij per dossier.
-- Handmatig te kiezen op de Informatie-tab; standaard afgeleid uit het
-- dossiernummer (5e teken = branch-code) of het Bouw7-filiaal.

alter table public.dossiers
  add column if not exists werkmaatschappij_id uuid references public.bedrijfsgegevens(id) on delete set null;

comment on column public.dossiers.werkmaatschappij_id is
  'Werkmaatschappij (bedrijfsgegevens.type=werkmaatschappij) van dit dossier. Handmatig te kiezen op de Informatie-tab; standaard afgeleid uit het dossiernummer/bouw7_filiaal.';
