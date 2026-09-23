-- Einddatum van het huidige arbeidscontract. EVA-only: Bouw7 kent geen contractperiode, en de sync
-- raakt de kolom dus niet. Leeg = onbepaalde tijd (of nog niet ingevuld). Staat los van
-- uit_dienst_per: een aflopend contract kan verlengd worden, uit dienst is definitief.
alter table public.medewerkers
  add column if not exists contract_einde date;

comment on column public.medewerkers.contract_einde is
  'Datum einde huidige arbeidscontract. Leeg = onbepaalde tijd. EVA-beheerd, niet uit Bouw7.';
