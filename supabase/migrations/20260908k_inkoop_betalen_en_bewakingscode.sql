-- Inkoopfacturen: betaalrondes vervangen door een simpele Betalen-markering,
-- en de bewakingscode erbij.
--
-- BETAALRONDES WAREN TE ZWAAR. Er zat een hele levenscyclus omheen — ronde aanmaken, vullen,
-- afronden, bevriezen — terwijl de behoefte veel kleiner is: de directie zet een vinkje bij een
-- factuur, en wie de betaling doet ziet welke facturen dat vinkje hebben. Meer niet. Alles wat
-- daaromheen zat was administratie die niemand vroeg.
--
-- De tabel `betaalrondes` is nooit gebruikt (nul rijen; de module stond pas een uur live), dus
-- die kan zonder dataverlies weg. Blijft over: drie kolommen op de factuur zelf.

alter table public.inkoopfacturen
  drop column if exists betaalronde_id,
  drop column if exists betaalronde_op,
  drop column if exists betaalronde_door,
  drop column if exists betaalronde_notitie;

drop table if exists public.betaalrondes;

alter table public.inkoopfacturen
  add column if not exists markering_betalen boolean     not null default false,
  add column if not exists betalen_op        timestamptz,
  add column if not exists betalen_door      uuid references public.medewerkers(id) on delete set null;

comment on column public.inkoopfacturen.markering_betalen is
  'Directie heeft deze factuur aangemerkt om mee te gaan in de eerstvolgende betaling. Puur een '
  'vlag: EVA betaalt niets en koppelt niet met Exact. Wie de betaling doet filtert hierop.';

-- Partieel: de vlag staat op false bij verreweg de meeste rijen, en we zoeken alleen de trues.
create index if not exists inkoopfacturen_betalen_idx
  on public.inkoopfacturen (markering_betalen) where markering_betalen;

-- ── Bewakingscode ───────────────────────────────────────────────────────────
-- Waar de kosten in Bouw7 op geboekt zijn. Komt NIET uit de Heimdall-lijst maar uit de
-- Apollo-zoekindex (`/search/purchase-invoices`, veld deliveryTicket.securityLink.code) —
-- één extra call voor de hele set, gefilterd op `datePaid IS NULL`.
alter table public.inkoopfacturen
  add column if not exists bewakingscode      text,
  add column if not exists bewakingscode_naam text,
  add column if not exists bewakingscode_hoofdstuk text;

comment on column public.inkoopfacturen.bewakingscode is
  'Bewakingscode van de leverbon onder deze factuur, bv. "KK.A". Bron: Apollo '
  '/search/purchase-invoices, deliveryTicket.securityLink.code.code. Leeg bij facturen zonder '
  'leverbon (overhead) en bij kosten zonder code.';

-- ── Audit: de betaalronde-acties vervallen ──────────────────────────────────
do $audit$
begin
  alter table public.inkoopfactuur_gebeurtenissen
    drop constraint if exists inkoopfactuur_gebeurtenissen_actie_check;
  alter table public.inkoopfactuur_gebeurtenissen
    add constraint inkoopfactuur_gebeurtenissen_actie_check
    check (actie in ('goedgekeurd','afgekeurd','opmerking','vote_mislukt',
                     'betalen_aan','betalen_uit'));
end $audit$;
