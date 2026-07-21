-- Rittenpagina koppelt per rit de open bevindingen via een lateral join op
-- trip_id. Zonder index deed Postgres per rit een seq scan over de hele
-- bevindingentabel (10.386 loops = ~1,7 s). Met index is dat een index-lookup
-- en duurt dezelfde query ~0,14 s. Nodig om alle ritten te kunnen laden.
create index if not exists compliance_bevindingen_trip_id_idx
  on public.compliance_bevindingen (trip_id)
  where trip_id is not null;
