-- =====================================================================
-- Everts Platform — Bedrijfsagenda: herhaling uitbreiding
-- Voegt interval, weekdagen en max-aantal kolommen toe.
-- =====================================================================

ALTER TABLE public.bedrijfsagenda_items
  ADD COLUMN IF NOT EXISTS herhaling_interval smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS herhaling_weekdagen smallint[],
  ADD COLUMN IF NOT EXISTS herhaling_aantal smallint;

COMMENT ON COLUMN public.bedrijfsagenda_items.herhaling_interval
  IS 'Herhaal elke N dagen/weken/maanden/jaren (default 1)';
COMMENT ON COLUMN public.bedrijfsagenda_items.herhaling_weekdagen
  IS 'Weekdagen voor wekelijkse herhaling: 1=Ma … 7=Zo (NULL = zelfde dag als start_datum)';
COMMENT ON COLUMN public.bedrijfsagenda_items.herhaling_aantal
  IS 'Eindigt na N herhalingen (incl. eerste voorkomen); NULL = geen limiet';
