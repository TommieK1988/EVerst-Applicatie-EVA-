-- Een medewerker die in EVA op inactief gaat, verhuist in Bouw7 naar de afdeling
-- "Inactief personeel". Om dat terug te kunnen draaien als hij weer actief wordt, onthouden we
-- de afdeling waar hij vandaan kwam. EVA's eigen `afdeling` is een andere indeling dan die van
-- Bouw7 en kan er dus niet voor gebruikt worden.
alter table public.medewerkers
  add column if not exists bouw7_afdeling_voor_inactief_id bigint;
comment on column public.medewerkers.bouw7_afdeling_voor_inactief_id is
  'Bouw7-afdeling waar deze medewerker stond vóór hij op inactief werd gezet; wordt hersteld zodra hij weer actief is.';
