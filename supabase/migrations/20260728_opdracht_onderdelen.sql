-- Opdracht-onderdelen — de samenstelling van een opdracht per dossier.
--
-- Eén rij = één stelpost of optie uit de geaccepteerde offerte, met de vastlegging of hij in
-- opdracht is en (voor stelposten) een eigen bewakingscode. De bewakingscode loopt via de
-- werkbegroting-kostengroep, zodat de kosten via de bestaande bestelregels+prognose-flow naar Bouw7
-- gaan (geen dubbeltelling). Bedragen worden gesnapshot uit de offerte zodat de samenstelling stabiel
-- blijft. Meerwerk staat bewust apart in public.meerwerk_regels (ander Bouw7-schrijfpad).

create table if not exists public.opdracht_onderdelen (
  id               uuid primary key default gen_random_uuid(),
  dossier_id       uuid not null references public.dossiers(id) on delete cascade,
  quote_id         uuid,                               -- everts-calc quotes.id (geen FK; calc-tabellen apart beheerd)
  soort            text not null check (soort in ('basis','stelpost','optie')),
  quote_section_id uuid,                               -- quote_sections.id (optie = sectie-niveau)
  quote_line_id    uuid,                               -- quote_lines.id (stelpost = regel-niveau)
  omschrijving     text not null,
  volgnummer       int  not null default 1,
  in_opdracht      boolean not null default true,      -- stelpost: true; optie: false tot aangezet
  bedrag_excl_btw  numeric(12,2),                      -- snapshot uit de geaccepteerde offerte
  btw_pct          numeric(5,2),
  bewakingscode    text,                               -- stelpost: kale code = werkbegroting-kostengroep; optie: null
  bouw7_chapter_id bigint,
  status           text not null default 'in_opdracht'
                     check (status in ('in_opdracht','uitgesloten','afgerond')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid
);

create index if not exists idx_opdracht_onderdelen_dossier on public.opdracht_onderdelen(dossier_id);
-- Dedupe per herkomst-regel/-sectie zodat opnieuw seeden (bijv. na revisie) nieuwe posten toevoegt
-- zonder bestaande te dupliceren en zonder in_opdracht-beslissingen te overschrijven.
create unique index if not exists uq_opdracht_onderdelen_line
  on public.opdracht_onderdelen(dossier_id, quote_line_id) where quote_line_id is not null;
create unique index if not exists uq_opdracht_onderdelen_section
  on public.opdracht_onderdelen(dossier_id, quote_section_id) where quote_section_id is not null;

comment on table public.opdracht_onderdelen is
  'Opdracht-samenstelling per opdracht-dossier: welke stelposten/opties in opdracht zijn, met per-stelpost bewakingscode (via werkbegroting-kostengroep). Geseed uit de geaccepteerde offerte; bedragen gesnapshot. Meerwerk staat apart in meerwerk_regels.';

-- RLS-basislijn conform 20260630_meerwerk_regels.sql.
alter table public.opdracht_onderdelen enable row level security;
drop policy if exists app_authenticated_all on public.opdracht_onderdelen;
create policy app_authenticated_all on public.opdracht_onderdelen
  for all to authenticated using (true) with check (true);
