-- Markeert dat de calculatieregels van een goedgekeurd meerwerk naar de werkbegroting zijn
-- overgehaald. Puur een idempotentie-anker: zonder dit zou de inhaalslag bij elk openen van de
-- werkbegroting regels terugzetten die de calculator daar bewust had weggehaald.
alter table public.meerwerk_regels
  add column if not exists wb_overgehaald_op timestamptz;

comment on column public.meerwerk_regels.wb_overgehaald_op is
  'Moment waarop de calculatieregels van dit meerwerk naar de werkbegroting zijn gekopieerd. Gevuld = niet opnieuw overhalen.';
