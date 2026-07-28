-- Meerwerk-calculaties zitten nu als scenario ín het dossier-calculatieproject
-- (gemarkeerd via het scenario, niet in de DB), niet meer in een apart project.
-- De kolom meerwerk_regels.calc_project_id (toegevoegd in 20260728c) is daarmee
-- overbodig en wordt verwijderd. Er zijn geen aparte meerwerk-projecten meer.

alter table public.meerwerk_regels
  drop column if exists calc_project_id;
