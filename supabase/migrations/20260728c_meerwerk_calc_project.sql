-- Meerwerk: eigen everts-calc calculatieproject per meerwerkregel.
-- Zo krijgt het meerwerk een volledig eigen, geïsoleerde calculatie + offerte,
-- losgekoppeld van de contractcalculatie (die verschijnt niet als "versie" in de
-- Versies-tabel van de opdracht). De knop "Calculatie" op een meerwerkregel maakt/
-- opent dit project; de offerte wordt er via de normale flow (met lay-out-keuze)
-- van gemaakt en krijgt meerwerk_regel_id → quote_id.

alter table public.meerwerk_regels
  add column if not exists calc_project_id uuid references public.projects(id) on delete set null;

comment on column public.meerwerk_regels.calc_project_id is
  'Eigen everts-calc project van deze meerwerkregel; de meerwerk-calculatie en -offerte leven hierin, los van de contractcalculatie.';
