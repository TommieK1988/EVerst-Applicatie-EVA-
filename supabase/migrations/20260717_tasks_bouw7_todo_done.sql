-- Afgevinkte taak mag niet terugkomen bij de Bouw7-sync.
--
-- De to-do-sync zette een taak met status 'gereed'/'vervallen' terug op 'open' zodra
-- de bijbehorende Bouw7 to-do nog `isDone=false` was. Omdat EVA het afvinken niet naar
-- Bouw7 terugschrijft, draaide elke sync het afvinken terug.
--
-- Deze kolom onthoudt de laatst geziene Bouw7-stand, zodat de sync onderscheid kan maken
-- tussen "Bouw7 heeft de to-do heropend" (wél heropenen) en "de gebruiker vinkte in EVA af
-- terwijl Bouw7 altijd al open stond" (niet aanraken).

alter table public.tasks
  add column if not exists bouw7_todo_done boolean not null default false;

comment on column public.tasks.bouw7_todo_done is
  'Laatst door de sync geziene `isDone` van de gekoppelde Bouw7 to-do. Alleen een overgang '
  'true → false geldt als heropening in Bouw7; staat de to-do al langer open, dan blijft de '
  'EVA-status (bv. handmatig afgevinkt) leidend. Betekenisloos als bouw7_todo_id NULL is.';
