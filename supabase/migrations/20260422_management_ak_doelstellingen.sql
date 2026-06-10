-- =====================================================================
-- Management: AK (Algemene Kosten) per werkmaatschappij
-- en Doelstellingen per werkmaatschappij / projectleider
-- =====================================================================

-- AK per werkmaatschappij per jaar
create table if not exists public.management_ak (
  id            uuid primary key default gen_random_uuid(),
  jaar          integer not null,
  filiaal       text not null,        -- naam van de werkmaatschappij
  bedrag_ak     numeric(14,2) not null default 0,
  opmerkingen   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (jaar, filiaal)
);

-- Doelstellingen: per werkmaatschappij én/of projectleider per jaar
create table if not exists public.management_doelstellingen (
  id                    uuid primary key default gen_random_uuid(),
  jaar                  integer not null,
  filiaal               text,           -- null = voor alle filialen
  projectleider         text,           -- null = voor alle PL's
  omzet_doelstelling    numeric(14,2),  -- gewenste jaaromzet
  resultaat_doelstelling numeric(14,2), -- gewenst jaarresultaat
  opmerkingen           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- Per jaar kunnen meerdere doelstellingen bestaan (per filiaal + PL combo)
  unique (jaar, filiaal, projectleider)
);

-- Indexen
create index if not exists ak_jaar_filiaal_idx on public.management_ak(jaar, filiaal);
create index if not exists ds_jaar_filiaal_idx on public.management_doelstellingen(jaar, filiaal);
create index if not exists ds_jaar_pl_idx      on public.management_doelstellingen(jaar, projectleider);

-- RLS
alter table public.management_ak              enable row level security;
alter table public.management_doelstellingen  enable row level security;

create policy "Auth read ak"
  on public.management_ak for select to authenticated using (true);
create policy "Auth write ak"
  on public.management_ak for all to authenticated using (true) with check (true);

create policy "Auth read doelstellingen"
  on public.management_doelstellingen for select to authenticated using (true);
create policy "Auth write doelstellingen"
  on public.management_doelstellingen for all to authenticated using (true) with check (true);
