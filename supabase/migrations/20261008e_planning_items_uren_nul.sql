-- Geplande uren worden sinds oktober 2026 altijd berekend uit periode + rooster
-- (apps/dashboard/src/lib/planning/werkuren.ts). Een blok dat volledig in het weekend of op een
-- vaste vrije dag valt is daarmee 0 uur — dat moet de database toestaan.
alter table public.planning_items drop constraint if exists planning_entries_uren_check;
alter table public.planning_items add constraint planning_entries_uren_check check (uren >= 0);
