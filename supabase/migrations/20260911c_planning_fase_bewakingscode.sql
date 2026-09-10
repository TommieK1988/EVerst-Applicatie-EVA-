-- Planning: bewakingscode op fase-niveau.
--
-- Een fase (in Bouw7 een hoofdstuk) groepeert activiteiten die doorgaans op dezelfde
-- bewakingscode geboekt worden. Door de code één keer op de fase te zetten erven de
-- activiteiten eronder hem automatisch en hoeft de planner hem niet per activiteit te
-- kiezen. De code blijft óók op de activiteit staan (dat is wat de rest van EVA en de
-- Bouw7-write lezen) — de fase vult hem alleen, ze vervangt hem niet als bron.

alter table public.planning_fasen
  add column if not exists bewakingscode text,
  add column if not exists bouw7_security_code_id bigint;

comment on column public.planning_fasen.bewakingscode is
  'Standaard Bouw7-bewakingscode voor de activiteiten in deze fase; nieuwe activiteiten erven hem.';
comment on column public.planning_fasen.bouw7_security_code_id is
  'Bouw7 securityCode.id behorend bij bewakingscode (voor de write-back van planitems).';
