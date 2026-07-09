-- Offerte-status vereenvoudigen naar twee waarden: 'concept' en 'verzonden' (= definitief).
-- De overgang concept → verzonden gebeurt automatisch bij het verzenden van de offerte;
-- overige statussen (geaccepteerd/afgewezen/verlopen) vervallen.

-- 1. Bestaande waarden defensief collapsen (op dit moment staat alles op 'concept',
--    dus dit raakt normaliter 0 rijen — maar voorkomt dat de nieuwe constraint faalt).
update public.quotes set status = 'verzonden' where status = 'geaccepteerd';
update public.quotes set status = 'concept'   where status in ('afgewezen', 'verlopen');

-- 2. CHECK-constraint vervangen: alleen nog 'concept' en 'verzonden' toegestaan.
alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('concept', 'verzonden'));
