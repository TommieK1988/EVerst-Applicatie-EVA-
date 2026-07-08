-- Fix: calculatie cross-device/gedeeld (zelfde bug-klasse als de werkbegroting).
--
-- Achtergrond. De everts-calc calculatie-editor draait op een localStorage-model
-- (scenarios → groepen → calculatieregels → componentregels). Bij Opslaan werd
-- alleen een *platgeslagen, verliesgevende* projectie naar `calculation_groups` +
-- `calculation_lines` geschreven (voor werkbegroting/rapportage), en er werd niets
-- teruggeladen. Gevolg: op een ander apparaat/andere gebruiker is de calculatie
-- onzichtbaar — precies de bug die bij de werkbegroting is opgelost.
--
-- De rijke editor-velden (werkomschrijving, opslag/BTW per regel, schilder-
-- behandeling, afbeeldingen, scenario-opslagen, betalingsconditie, componenten…)
-- passen niet in de smalle `calculation_lines`-tabel. Daarom bewaren we het
-- volledige model verliesloos als JSONB-snapshot per project. De bestaande
-- genormaliseerde upsert blijft ongewijzigd zodat downstream (werkbegroting,
-- offerte, rapportage) blijft werken.

create table if not exists public.calculatie_snapshots (
  project_id    uuid primary key references public.projects(id) on delete cascade,
  data          jsonb not null,
  bijgewerkt_op timestamptz not null default now()
);

comment on table public.calculatie_snapshots is
  'Verliesloze JSONB-snapshot van het everts-calc editor-model per project (scenarios/groepen/regels/componenten), zodat de calculatie op elk apparaat/elke gebruiker gehydrateerd kan worden. Bron van waarheid voor de editor; calculation_groups/calculation_lines blijven de genormaliseerde projectie voor werkbegroting/rapportage.';

-- RLS-basislijn conform 20260616c: alleen ingelogde (authenticated) gebruikers.
alter table public.calculatie_snapshots enable row level security;
drop policy if exists app_authenticated_all on public.calculatie_snapshots;
create policy app_authenticated_all on public.calculatie_snapshots
  for all to authenticated using (true) with check (true);
