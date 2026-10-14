-- Auditlog inkoopfacturen: bewakingscode gewijzigd vanuit het goedkeurscherm (okt 2026).
alter table public.inkoopfactuur_gebeurtenissen drop constraint if exists inkoopfactuur_gebeurtenissen_actie_check;
alter table public.inkoopfactuur_gebeurtenissen add constraint inkoopfactuur_gebeurtenissen_actie_check
  check (actie in (
    'goedgekeurd', 'afgekeurd', 'opmerking', 'vote_mislukt', 'betalen_aan', 'betalen_uit',
    'route_bepaald', 'overgedragen', 'bouw7_bijgewerkt', 'bouw7_mislukt', 'vervallen',
    'bewakingscode_gewijzigd'
  ));
