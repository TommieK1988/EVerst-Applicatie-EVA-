-- 20260623b_evc_materialen_merk_groepmapping.sql
--
-- Uitbreiding op de Materialen/DICO-koppeling:
--   1. evc_materialen     — `merk` (artikelmerk indien leverancier dit meelevert) en
--                           `leverancier_productgroep` (ruwe groep uit het DICO-bericht).
--   2. dico_groep_mapping — koppeling leveranciers-productgroep -> eigen materiaalgroep,
--                           per leverancier onthouden zodat elke volgende import goed staat.
--
-- Idempotent.

alter table public.evc_materialen
  add column if not exists merk text,
  add column if not exists leverancier_productgroep text;

create index if not exists idx_evc_materialen_merk  on public.evc_materialen(merk);
create index if not exists idx_evc_materialen_levpg on public.evc_materialen(leverancier, leverancier_productgroep);

-- Bestaande DICO-rijen: de ruwe leveranciers-productgroep stond tot nu toe in materiaalgroep.
update public.evc_materialen
  set leverancier_productgroep = materiaalgroep
  where bron in ('dico_import','dico_api')
    and leverancier_productgroep is null
    and materiaalgroep is not null;

-- Eigen materiaalgroep leegmaken voor DICO-rijen; die wordt voortaan via de koppeling gezet.
update public.evc_materialen
  set materiaalgroep = null
  where bron in ('dico_import','dico_api');

create table if not exists public.dico_groep_mapping (
  id                       uuid primary key default gen_random_uuid(),
  leverancier              text not null,
  leverancier_productgroep text not null,
  materiaalgroep           text,            -- null = bewust niet gekoppeld
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (leverancier, leverancier_productgroep)
);

alter table public.dico_groep_mapping enable row level security;
drop policy if exists app_authenticated_all on public.dico_groep_mapping;
create policy app_authenticated_all on public.dico_groep_mapping
  for all to authenticated using (true) with check (true);
