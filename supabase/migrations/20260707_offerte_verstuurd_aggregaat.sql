-- Aggregaat van offertes met status "Verstuurd" per dossier.
-- Een project kan meerdere offertes op status Verstuurd hebben; de kanban-kaart toonde tot nu
-- toe automatisch het bedrag van de laatst opgestelde offerte. Deze velden maken het mogelijk
-- om een indicator + het totaalbedrag (excl. btw) van álle verstuurde offertes te tonen.
--   dossiers.offerte_verstuurd_aantal        — aantal offertes op status Verstuurd
--   dossiers.offerte_verstuurd_som_excl_btw  — som van de offerte-subtotalen (verkoop, excl. btw)
-- Beide worden tijdens de Bouw7-sync gevuld uit /list/quotations.

alter table public.dossiers
  add column if not exists offerte_verstuurd_aantal       integer,
  add column if not exists offerte_verstuurd_som_excl_btw numeric;

comment on column public.dossiers.offerte_verstuurd_aantal is
  'Aantal Bouw7-offertes met status "Verstuurd" voor dit project (gevuld tijdens sync).';
comment on column public.dossiers.offerte_verstuurd_som_excl_btw is
  'Som van de subtotalen (verkoop excl. btw) van alle offertes met status "Verstuurd".';
