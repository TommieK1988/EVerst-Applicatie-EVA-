-- =====================================================================
-- Management: vastgestelde maandcijfers (snapshot na financieel overleg)
-- Overschrijven bij hervaststellen: parent uniek op periode.
-- =====================================================================

create table if not exists public.management_maand_snapshot (
  id                    uuid primary key default gen_random_uuid(),
  periode               date not null unique,          -- eerste dag van de maand (bv 2026-05-01)
  kpi                   jsonb not null,                -- financiele aggregaten (zelfde shape als dashboard)
  funnel                jsonb,                         -- aanvraag/offerte funnel-cijfers op vaststelmoment
  calculators           jsonb,                         -- calculator-leaderboard op vaststelmoment
  vastgesteld_door_id   uuid references public.medewerkers(id) on delete set null,
  vastgesteld_door_naam text,                          -- gedenormaliseerd voor stabiele weergave
  opmerking             text,
  vastgesteld_op        timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

create index if not exists mms_periode_idx
  on public.management_maand_snapshot (periode desc);

-- Per-project regels zoals vastgelegd op het vaststelmoment (voor drilldown/trend)
create table if not exists public.management_maand_snapshot_regel (
  id                 uuid primary key default gen_random_uuid(),
  snapshot_id        uuid not null references public.management_maand_snapshot(id) on delete cascade,
  projectnummer      text not null,
  bouw7_id           text,
  filiaal            text,
  status             text,
  opdrachtgever      text,
  projectnaam        text,
  categorie          text,
  projectleider      text,
  geboekte_kosten    numeric(14,2),
  totale_opdracht    numeric(14,2),
  pct_gereed         numeric(6,2),
  totale_prognose    numeric(14,2),
  verwacht_resultaat numeric(14,2),
  pct_marge          numeric(6,2),
  omzet_obv_pct      numeric(14,2),
  resultaat_obv_pct  numeric(14,2),
  gefactureerd       numeric(14,2),
  resultaat_gereed   numeric(14,2),
  pct_marge_gereed   numeric(6,2),
  verschil_pct_marge numeric(6,2),
  is_gereed          boolean not null default false,
  kosten_split       jsonb,
  dossier_id         uuid,
  dossier_sectie     text
);

create index if not exists mmsr_snapshot_idx
  on public.management_maand_snapshot_regel (snapshot_id);
create index if not exists mmsr_snapshot_filiaal_idx
  on public.management_maand_snapshot_regel (snapshot_id, filiaal);

-- RLS (conform management_ak/doelstellingen)
alter table public.management_maand_snapshot        enable row level security;
alter table public.management_maand_snapshot_regel  enable row level security;

create policy "Auth read maand_snapshot"
  on public.management_maand_snapshot for select to authenticated using (true);
create policy "Auth write maand_snapshot"
  on public.management_maand_snapshot for all to authenticated using (true) with check (true);

create policy "Auth read maand_snapshot_regel"
  on public.management_maand_snapshot_regel for select to authenticated using (true);
create policy "Auth write maand_snapshot_regel"
  on public.management_maand_snapshot_regel for all to authenticated using (true) with check (true);
