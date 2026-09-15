-- =====================================================================
-- Herhalende sjabloontaken: aanlooptijd vóór de eerste keer
--
-- Een herhalende sjabloontaak rolde tot nu toe uit vanaf dag 1 van het
-- uitvoeringsvenster. Voor een werkplekinspectie is dat zinloos: op de
-- eerste dag staat de steiger er nog niet en valt er niets te beoordelen.
--
-- Deze kolom schuift de hele reeks op: bij 14 valt keer 1 twee weken na
-- de start van de planning, keer 2 een maand later, enzovoort. Het ritme
-- van het interval blijft dus intact.
-- =====================================================================

alter table public.tasks
  add column if not exists herhaling_start_offset_dagen integer not null default 0;

comment on column public.tasks.herhaling_start_offset_dagen is
  'Aantal dagen na de start van het uitvoeringsvenster waarop de eerste keer van een '
  'herhalende sjabloontaak valt. 0 = meteen op de eerste dag. Alleen betekenisvol op '
  'sjabloontaken met herhaling_interval <> ''geen''.';

-- Werkplekinspectie (VCA**): twee weken aanlooptijd.
update public.tasks
   set herhaling_start_offset_dagen = 14
 where id = 'f77adaf9-7318-4a8d-80a0-e8506804d13a';
