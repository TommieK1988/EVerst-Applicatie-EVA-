-- RPC-functie: geeft vroegste start en laatste eind van planning_items per dossier.
-- Gebruikt in Projectplanning-tab om planbalkbreedte op detailplanning te baseren.
create or replace function planning_datums_per_dossier()
returns table (
  dossier_id    uuid,
  planning_start date,
  planning_eind  date
)
language sql
stable
security definer
as $$
  select
    pa.dossier_id,
    min(pi.start_dt)::date as planning_start,
    max(pi.eind_dt)::date  as planning_eind
  from planning_items pi
  join planning_activiteiten pa on pa.id = pi.activiteit_id
  group by pa.dossier_id;
$$;
