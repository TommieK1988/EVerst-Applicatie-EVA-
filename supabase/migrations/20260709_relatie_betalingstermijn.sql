-- Betalingstermijn (aantal dagen) per relatie/klant.
-- Wordt als offerte-variabele {klant.betalingstermijn_dagen} beschikbaar en is
-- puur EVA-beheerd (Bouw7-sync raakt dit veld niet).
alter table public.relaties
  add column if not exists betalingstermijn_dagen integer;

comment on column public.relaties.betalingstermijn_dagen is
  'Standaard betalingstermijn in dagen voor deze klant; bron voor offerte-variabele klant.betalingstermijn_dagen.';
