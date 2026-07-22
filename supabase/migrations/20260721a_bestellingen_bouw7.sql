-- Bestellingen worden echte Bouw7-documenten: een inkooporder (/contracts/purchase-order)
-- of een onderaannemerscontract (/contracts/subcontractor). Tot nu toe was "verzenden"
-- alleen een status in EVA.
--
-- bouw7_contract_id is het idempotentie-anker (zelfde patroon als
-- werkbegroting_componenten.bouw7_line_id): aanwezig = update, leeg = create.

alter table public.werkbegroting_bestellingen
  add column if not exists soort             text,
  add column if not exists bouw7_contract_id bigint,
  add column if not exists bouw7_nummer      text,
  add column if not exists bouw7_sync_status text,
  add column if not exists bouw7_sync_fout   text,
  add column if not exists bouw7_gesynct_op  timestamptz,
  add column if not exists levering_datum    date,
  add column if not exists levering_tekst    text,
  add column if not exists betaalafspraak    text,
  add column if not exists interne_notitie   text;

comment on column public.werkbegroting_bestellingen.soort is
  'inkooporder (POST /contracts/purchase-order) | oa_contract (POST /contracts/subcontractor). Volgt uit het componenttype.';
comment on column public.werkbegroting_bestellingen.bouw7_contract_id is
  'Bouw7-contract-id. Aanwezig = de bestelling bestaat in Bouw7; een volgende push is een update, geen duplicaat.';
comment on column public.werkbegroting_bestellingen.bouw7_nummer is
  'Contractnummer uit Bouw7, bv. 20261.00357OA002. Alleen ter herkenning in de UI.';
comment on column public.werkbegroting_bestellingen.levering_tekst is
  'Vrije-tekst leverdatum (Bouw7 deliveryDateText/startDateText) voor "week 34"-achtige afspraken.';

alter table public.werkbegroting_bestellingen
  drop constraint if exists werkbegroting_bestellingen_soort_check;
alter table public.werkbegroting_bestellingen
  add constraint werkbegroting_bestellingen_soort_check
  check (soort is null or soort in ('inkooporder', 'oa_contract'));

-- Eén Bouw7-contract hoort bij precies één EVA-bestelling; een dubbele koppeling zou
-- betekenen dat twee bestellingen hetzelfde document overschrijven.
create unique index if not exists werkbegroting_bestellingen_bouw7_contract_idx
  on public.werkbegroting_bestellingen (bouw7_contract_id)
  where bouw7_contract_id is not null;
