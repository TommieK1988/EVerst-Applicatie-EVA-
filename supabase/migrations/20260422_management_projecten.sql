-- =====================================================================
-- Management projecten — gefinancierd vanuit Bouw7 sync
-- Bevat alle projecten met financiële data voor het management-overzicht:
--   • Lopende Werken: kosten, opdracht, prognose, marge, resultaat
--   • Gereed Werken:  gefactureerd, kosten, resultaat, marge
-- =====================================================================

create table if not exists public.management_projecten (
  id                    uuid primary key default gen_random_uuid(),

  -- Project-identificatie
  projectnummer         text not null,
  bouw7_id              text unique,
  filiaal               text,
  status                text,
  opdrachtgever         text,
  projectnaam           text not null,
  categorie             text,
  projectleider         text,

  -- Financieel: Lopende Werken
  geboekte_kosten       numeric(14,2),
  totale_opdracht       numeric(14,2),
  pct_gereed            numeric(6,2),          -- 0–100
  totale_prognose       numeric(14,2),
  verwacht_resultaat    numeric(14,2),
  pct_marge             numeric(6,2),
  omzet_obv_pct         numeric(14,2),
  resultaat_obv_pct     numeric(14,2),

  -- Financieel: Gereed Werken
  gefactureerd          numeric(14,2),
  resultaat_gereed      numeric(14,2),
  pct_marge_gereed      numeric(6,2),
  verschil_pct_marge    numeric(6,2),

  -- Status
  is_gereed             boolean not null default false,

  -- Bouw7 sync
  bouw7_laatst_sync     timestamptz,
  bouw7_sync_status     text,   -- 'synced' | 'pending' | 'error'
  bouw7_sync_fout       text,

  -- Audit
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Indexen voor snelle filtering op veelgebruikte kolommen
create index if not exists mp_bouw7_id_idx        on public.management_projecten(bouw7_id);
create index if not exists mp_is_gereed_idx       on public.management_projecten(is_gereed);
create index if not exists mp_projectleider_idx   on public.management_projecten(projectleider);
create index if not exists mp_filiaal_idx         on public.management_projecten(filiaal);
create index if not exists mp_categorie_idx       on public.management_projecten(categorie);
create index if not exists mp_pct_marge_idx       on public.management_projecten(pct_marge);

-- RLS: alleen ingelogde gebruikers
alter table public.management_projecten enable row level security;

create policy "Authenticated users can read management_projecten"
  on public.management_projecten for select
  to authenticated using (true);

create policy "Authenticated users can insert management_projecten"
  on public.management_projecten for insert
  to authenticated with check (true);

create policy "Authenticated users can update management_projecten"
  on public.management_projecten for update
  to authenticated using (true);
