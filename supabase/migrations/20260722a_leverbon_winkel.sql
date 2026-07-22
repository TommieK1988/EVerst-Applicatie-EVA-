-- Leverbon + Winkel-budget.
--
-- Bouw7 heeft een leverbon nodig om een inkoopfactuur aan een order/contract te matchen. Die bon
-- ontstaat door de contracttermijnen af te roepen (POST /contracts/{soort}/approve-contract-terms);
-- Bouw7 maakt hem dan zelf, mét contractkoppeling. EVA bewaart id en nummer om hem te kunnen
-- intrekken en om de koppeling te tonen.

alter table public.werkbegroting_bestellingen
  add column if not exists bouw7_leverbon_id bigint,
  add column if not exists bouw7_bonnummer   text,
  add column if not exists bouw7_afroep_op   timestamptz;

comment on column public.werkbegroting_bestellingen.bouw7_leverbon_id is
  'Leverbon-id uit Bouw7, ontstaan bij het afroepen van de contracttermijnen.';
comment on column public.werkbegroting_bestellingen.bouw7_bonnummer is
  'Bonnummer, door Bouw7 gezet als <contractnummer>B001.';

-- Winkel = budgetreservering bij een leverancier: geen artikelregels, één bedrag per
-- bewakingscode. Alleen zinvol op materiaal-componenten.
alter table public.werkbegroting_componenten
  add column if not exists is_winkel boolean not null default false;

comment on column public.werkbegroting_componenten.is_winkel is
  'Winkelbudget: wordt als één samengevatte budgetregel besteld i.p.v. per artikel.';
