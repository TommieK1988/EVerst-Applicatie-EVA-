-- Voeg start_tijd en eind_tijd toe aan medewerker_afwezigheid
-- Voor gedeeltelijke afwezigheid (bijv. halve dag verlof)
alter table public.medewerker_afwezigheid
  add column if not exists start_tijd time,
  add column if not exists eind_tijd  time;
