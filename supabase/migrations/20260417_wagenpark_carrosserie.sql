-- Voertuig: carrosserietype uit RDW (bv. "stationwagen", "gesloten opbouw")
alter table public.voertuigen
  add column if not exists carrosserietype text;
