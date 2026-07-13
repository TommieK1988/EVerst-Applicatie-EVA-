-- Gekoppeld calculatie↔offerte versiebeheer — bevroren versie-snapshots.
--
-- Bij het verzenden van een offerte wordt de bijbehorende calculatie bevroren:
-- een onveranderbare kopie van de scenario-subboom (scenario + groepen + regels +
-- componenten) wordt hier per offerteversie bewaard, zodat een verzonden versie
-- exact reproduceerbaar blijft, onafhankelijk van latere bewerkingen in de
-- gedeelde `calculatie_snapshots`-blob. De `quote_lines` blijven het primaire
-- (juridische) record; deze tabel is de audit-kopie van de volledige begroting.

create table if not exists public.calculatie_versie_snapshots (
  quote_id     uuid primary key references public.quotes(id) on delete cascade,
  scenario_id  text not null,
  project_id   text not null,
  data         jsonb not null,
  bevroren_op  timestamptz not null default now()
);

create index if not exists idx_calc_versie_snapshots_scenario
  on public.calculatie_versie_snapshots (scenario_id);
create index if not exists idx_calc_versie_snapshots_project
  on public.calculatie_versie_snapshots (project_id);

comment on table public.calculatie_versie_snapshots is
  'Onveranderbare, bevroren kopie van de calculatie-subboom (scenario/groepen/regels/componenten) bij een verzonden offerteversie. Gezet in verstuurOfferte; audit-proof reproductie los van calculatie_snapshots.';

-- RLS-basislijn conform 20260616c: alleen ingelogde (authenticated) gebruikers.
alter table public.calculatie_versie_snapshots enable row level security;
drop policy if exists app_authenticated_all on public.calculatie_versie_snapshots;
create policy app_authenticated_all on public.calculatie_versie_snapshots
  for all to authenticated using (true) with check (true);
