-- =====================================================================
-- Management: OHW-correctie per dossier (onderhanden werk per 1 januari)
--
-- Per meerjarig project levert Bouw7 een *cumulatieve* realisatie aan.
-- Die stand bevat ook werk uit vorige boekjaren. Met een OHW-regel geef je
-- per dossier handmatig op hoeveel omzet/resultaat al aan het vórige boekjaar
-- toebehoort (stand per 1 januari). Het dashboard trekt dit af van de
-- Gerealiseerd-cijfers en telt de correctie per werkmaatschappij op.
-- =====================================================================

create table if not exists public.management_ohw (
  id                        uuid primary key default gen_random_uuid(),
  boekjaar                  integer not null,            -- jaar van de 1-jan-stand (bv. 2026)
  bouw7_id                  text not null,               -- matchsleutel naar management_projecten.bouw7_id
  -- Snapshot van projectinfo (leesbaarheid in de lijst, ook als het project
  -- later uit de sync verdwijnt):
  projectnummer             text,
  projectnaam               text,
  filiaal                   text,
  -- De correctie: bedragen die aan het vórige boekjaar worden toegewezen.
  omzet_vorig_boekjaar      numeric(14,2) not null default 0,
  resultaat_vorig_boekjaar  numeric(14,2) not null default 0,
  opmerkingen               text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (boekjaar, bouw7_id)
);

create index if not exists ohw_boekjaar_idx  on public.management_ohw(boekjaar);
create index if not exists ohw_bouw7_id_idx   on public.management_ohw(bouw7_id);

-- RLS (zelfde patroon als management_ak / management_doelstellingen)
alter table public.management_ohw enable row level security;

create policy "Auth read ohw"
  on public.management_ohw for select to authenticated using (true);
create policy "Auth write ohw"
  on public.management_ohw for all to authenticated using (true) with check (true);
