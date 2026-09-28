-- Standaard losse factuurregels + regie-uurtarieven EVA-beheerd.
--
-- 1. factuur_standaardregels: een bedrijfsbrede kieslijst voor losse regels op een regiefactuur
--    (voorrijkosten, opstartkosten, klein materiaal). Beheer: Instellingen → Facturatie. Kiezen
--    kopieert omschrijving/eenheid/prijs/btw naar een losse regel (factuur_regelgroepen, 'los:');
--    de factuur houdt dus geen verwijzing naar de standaardregel — een latere prijswijziging
--    verandert geen bestaande factuur. Klantspecifieke regels staan al in
--    relatie_verkoop_prijsafspraken en verschijnen in dezelfde kiezer.
--
-- 2. relatie_uurtarieven: was read-only (alleen Bouw7-sync, die in de praktijk niets levert).
--    Nu te beheren op de relatiepagina (bron = 'eva'); de sync slaat EVA-rijen over.

create table if not exists public.factuur_standaardregels (
  id             uuid           primary key default gen_random_uuid(),
  omschrijving   text           not null check (length(btrim(omschrijving)) > 0),
  eenheid        text,
  prijs          numeric(12,2),
  btw_tarief_id  uuid           references public.btw_tarieven(id) on delete set null,
  volgorde       integer        not null default 0,
  actief         boolean        not null default true,
  created_at     timestamptz    not null default now(),
  updated_at     timestamptz    not null default now()
);

create index if not exists idx_factuur_standaardregels_volgorde
  on public.factuur_standaardregels (actief, volgorde);

comment on table public.factuur_standaardregels is
  'Bedrijfsbrede kieslijst voor losse regels op een regiefactuur. Kiezen kopieert de waarden; geen FK vanaf de factuur.';

alter table public.factuur_standaardregels enable row level security;
drop policy if exists factuur_standaardregels_authenticated on public.factuur_standaardregels;
create policy factuur_standaardregels_authenticated
  on public.factuur_standaardregels
  for all
  to authenticated
  using (true)
  with check (true);

comment on table public.relatie_uurtarieven is
  'Verkoop-uurtarief per relatie × uursoort. bron=eva: afgesproken op de relatiepagina (leidend, sync slaat over); bron=bouw7: uit Bouw7 contact "Uurtarief per uurtype". Default voor regie-uren op de regiefactuur.';
