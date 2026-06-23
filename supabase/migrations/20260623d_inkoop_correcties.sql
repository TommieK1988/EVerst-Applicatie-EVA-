-- Inkoop-correcties: EVA-rekenlaag over geboekte kosten uit Bouw7.
--
-- Doel: als de administratie een inkoopfactuur in Bouw7 op de verkeerde inkooporder/
-- onderaannemerscontract of bewakingscode heeft geboekt, kan EVA dat corrigeren ZONDER
-- het fiscale Bouw7-document te wijzigen. De correctie verandert alleen hoe EVA het
-- saldo per order/contract en de kosten per bewakingscode berekent. NIET teruggeschreven
-- naar Bouw7 (factuurbedrag/BTW/factuurnummer blijven onaangeroerd).
--
-- Eén rij = één correctie op één geboekte kostenregel (= één Bouw7-inkoopfactuur).

create table if not exists public.inkoop_correcties (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  -- Identificatie van de geboekte kost in Bouw7:
  bron_type text not null default 'purchase_invoice',
  bron_id bigint not null,                      -- Bouw7 purchase-invoice id (stabiel, uniek per rij)
  -- Correcties (null = ongewijzigd t.o.v. Bouw7):
  bewakingscode_override text,                  -- kale code, bv. 'BI.A'
  bewakingscode_naam_override text,             -- codenaam, bv. 'Schilderwerk trap'
  toegewezen_order_id bigint,                   -- contract-order-line id, of null
  toegewezen_contract_id bigint,                -- subcontractor-contract id, of null
  opmerking text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (dossier_id, bron_type, bron_id)
);

create index if not exists idx_inkoop_correcties_dossier on public.inkoop_correcties(dossier_id);

comment on table public.inkoop_correcties is
  'EVA-rekenlaag over Bouw7 geboekte kosten: hercodeer/verplaats een inkoopfactuur naar andere bewakingscode/order/contract zonder het fiscale Bouw7-document te wijzigen. Niet teruggeschreven naar Bouw7.';

-- RLS-basislijn conform 20260616c: alleen ingelogde (authenticated) gebruikers; server-admin
-- (service_role) omzeilt RLS sowieso; anon geblokkeerd.
alter table public.inkoop_correcties enable row level security;
drop policy if exists app_authenticated_all on public.inkoop_correcties;
create policy app_authenticated_all on public.inkoop_correcties
  for all to authenticated using (true) with check (true);
