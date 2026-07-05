-- Planning: bewakingscode op activiteit-niveau.
-- Een planitem staat altijd op een bewakingscode (via zijn activiteit). Bouw7-gesyncte
-- activiteiten krijgen de code uit securityPlanningLink.securityCode; EVA-gemaakte
-- activiteiten (snel inplannen vanuit de Medewerkerplanning) kiezen er verplicht één.

alter table public.planning_activiteiten
  add column if not exists bewakingscode text,
  add column if not exists bouw7_security_code_id bigint;

comment on column public.planning_activiteiten.bewakingscode is
  'Kale Bouw7-bewakingscode (securityCode.code) waar dit werk op geboekt wordt; verplicht bij EVA-gemaakte activiteiten uit de Medewerkerplanning.';
comment on column public.planning_activiteiten.bouw7_security_code_id is
  'Bouw7 securityCode.id behorend bij bewakingscode (voor latere write-back).';
