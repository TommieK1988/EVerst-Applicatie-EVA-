-- Bij welke bestaande Bouw7-bewakingscode staan de kosten van deze meerwerkregel?
--
-- Los van `bewakingscode`: die kolom is de eigen code die EVA voor het meerwerk uitdeelt (MW01…),
-- en die zet ook een kostengroep in werkbegroting en planning en, bij regie, de nacalculatie in
-- gang. Veel meerwerk (vooral uit Bouw7 geïmporteerd) heeft geen eigen code; de kosten staan dan
-- op een bestaande projectcode zoals HR.A. Deze kolom legt alleen die koppeling vast, zodat het
-- Financieel-tab het resultaat per code kan tonen. Verder doet hij niets.
alter table public.meerwerk_regels
  add column if not exists kosten_bewakingscode text;

comment on column public.meerwerk_regels.kosten_bewakingscode is
  'Bestaande Bouw7-bewakingscode waarop de kosten van dit meerwerk staan (alleen voor resultaat per code; geen Bouw7-write).';
