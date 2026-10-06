-- Bewakingscodes koppelen aan de Hoofdopdracht.
--
-- Een extra indeling, geen rekenregel: welke bewakingscodes van een dossier vormen samen de
-- hoofdopdracht. De werkbegroting gebruikt het als sorteerlaag ("Per post") en het blok Verwacht
-- resultaat om de bewakingscodes onder de Hoofdopdracht te groeperen. Geen enkel bedrag of totaal
-- hangt hiervan af.
--
-- Per codetekst binnen een dossier: dezelfde code in twee Bouw7-hoofdstukken krijgt één koppeling,
-- net als in de werkbegroting (die kent het hoofdstuk niet). Geen rij = nog niet gekoppeld.
-- Stelposten en meerwerk houden hun eigen code en worden hier niet gekoppeld.
--
-- EVA-eigen, niet naar Bouw7 (Bouw7 kent alleen hoofdstuk → bewakingscode).
-- Additief: geen bestaande kolommen gewijzigd.

create table if not exists public.bewakingscode_koppelingen (
  id             uuid primary key default gen_random_uuid(),
  dossier_id     uuid not null references public.dossiers(id) on delete cascade,
  bewakingscode  text not null,
  doel           text not null default 'hoofdopdracht',
  gekoppeld_door uuid,
  gekoppeld_op   timestamptz not null default now(),

  constraint bewakingscode_koppelingen_doel check (doel = 'hoofdopdracht'),
  constraint bewakingscode_koppelingen_code_niet_leeg check (btrim(bewakingscode) <> ''),
  constraint bewakingscode_koppelingen_uniek unique (dossier_id, bewakingscode)
);

comment on table public.bewakingscode_koppelingen is
  'Welke bewakingscodes van een dossier bij de Hoofdopdracht horen. Alleen indeling/sortering (werkbegroting, Verwacht resultaat), geen rekenregel. EVA-eigen.';

-- Lezen mag elke platformgebruiker; muteren alleen via server actions op de service role.
-- Subquery-vorm tegen de initplan-valkuil.
alter table public.bewakingscode_koppelingen enable row level security;

drop policy if exists bewakingscode_koppelingen_select on public.bewakingscode_koppelingen;
create policy bewakingscode_koppelingen_select
  on public.bewakingscode_koppelingen
  for select
  to authenticated
  using ((select public.is_platform_gebruiker()));
