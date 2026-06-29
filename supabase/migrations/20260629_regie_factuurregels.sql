-- Regie-factuurregels — EVA-laag bovenop de live Bouw7-boekingen (servicedesk regie).
--
-- Eén rij = één voorstel-factuurregel, afgeleid van een geboekte uur- of kostenregel uit
-- Bouw7. De gebruiker stelt opslag/verkoopprijs in en kan regels uitsluiten; daarna worden
-- de niet-uitgesloten regels als concept-verkoopfactuur naar Bouw7 gepusht (POST /invoice).
-- Volgt het patroon van inkoop_correcties (EVA-rekenlaag, geen Bouw7-document gewijzigd
-- behalve het bewust aangemaakte concept).

create table if not exists public.regie_factuurregels (
  id                uuid primary key default gen_random_uuid(),
  dossier_id        uuid not null references public.dossiers(id) on delete cascade,
  bron_type         text not null,                 -- 'uur' | 'kost'
  bron_bouw7_id     text,                           -- Bouw7 hour-log / purchase-invoice id
  omschrijving      text,
  aantal            numeric(12,2),
  eenheid           text,
  inkoop_bedrag     numeric(12,2),                  -- kostprijs/inkoopwaarde (excl. BTW)
  opslag_pct        numeric(6,2),                   -- toegepaste opslag (bv. 25.00)
  verkoop_tarief    numeric(12,2),                  -- voor uren: tarief per eenheid
  verkoop_bedrag    numeric(12,2),                  -- berekende verkoopwaarde (excl. BTW)
  btw_pct           numeric(5,2),
  bewakingscode     text,
  uitgesloten       boolean not null default false,
  status            text not null default 'concept', -- 'concept' | 'gefactureerd'
  bouw7_invoice_id  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  unique (dossier_id, bron_type, bron_bouw7_id)
);

create index if not exists idx_regie_factuurregels_dossier on public.regie_factuurregels(dossier_id);

comment on table public.regie_factuurregels is
  'EVA-laag over geboekte Bouw7 uren/kosten: opslag/verkoopprijs per regel voor regie-facturatie; gepusht als concept-verkoopfactuur naar Bouw7.';

-- RLS-basislijn conform 20260616c.
alter table public.regie_factuurregels enable row level security;
drop policy if exists app_authenticated_all on public.regie_factuurregels;
create policy app_authenticated_all on public.regie_factuurregels
  for all to authenticated using (true) with check (true);
