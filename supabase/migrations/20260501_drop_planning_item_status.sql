-- Drop status uit planning_items.
-- Reden: schijnvertrouwen — werkelijke uitvoeringsstaat ligt in `werkbonnen`
-- (bestaan + klaar_gemeld_op). Een aparte status-kolom liep daar achteraan.
-- Annulering van een planitem gebeurt via hard-delete.

alter table public.planning_items
  drop column if exists status;

-- Enum opruimen als geen kolommen er meer aan refereren
do $$
begin
  if not exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_type  t on t.oid = a.atttypid
    where t.typname = 'planning_entry_status'
      and not a.attisdropped
  ) then
    drop type if exists public.planning_entry_status;
  end if;
end $$;
