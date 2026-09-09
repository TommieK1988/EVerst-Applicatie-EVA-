-- Mailintake: objectkoppeling en Bouw7-gereedheid op het intakebericht.
-- Toegepast op 2026-09-09 via de Supabase MCP.
--
-- object_id
--   Het vastgoedobject dat bij het werkadres hoort. Alleen gevuld bij een
--   eenduidige treffer; bij twijfel blijft hij leeg en toont het behandelscherm
--   de kandidaten. Zie lib/mailintake/objecten.ts — de meeste objecten zijn
--   complexen met een vrij-tekstadres ("Delftselaan 7 t/m 79"), dus matchen op
--   postcode + huisnummer alleen zou juist het VvE- en corporatiewerk missen.
--
-- bouw7_gereed / bouw7_ontbreekt
--   Kan er überhaupt een net Bouw7-project van gemaakt worden? Bouw7 eist
--   formeel alleen `type` en `status`, dus een project zónder klant wordt
--   gewoon aangemaakt — en dat valt pas weken later op. Deze controle draait
--   vóór het aanmaken en blokkeert de automatische route.
alter table public.mailintake_berichten
  add column if not exists object_id uuid references public.vastgoed_objecten(id) on delete set null,
  add column if not exists object_score numeric(3,2),
  add column if not exists object_via text,
  add column if not exists bouw7_gereed boolean,
  add column if not exists bouw7_ontbreekt text[] not null default '{}';

create index if not exists mailintake_berichten_object_idx
  on public.mailintake_berichten (object_id) where object_id is not null;
