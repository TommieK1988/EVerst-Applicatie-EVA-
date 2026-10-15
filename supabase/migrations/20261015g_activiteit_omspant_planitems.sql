-- Eenmalige reparatie: elke activiteit omspant haar planitems.
--
-- Vanaf nu verbreden de planning-acties een activiteit zodra een planitem erbuiten komt
-- (lib/planning/activiteit-bereik.ts). Planitems die daarvóór verplaatst, gekopieerd of vanuit
-- de Medewerkerplanning ingepland werden, staan nog buiten hun activiteit- en fasebalk. Hier
-- trekken we die activiteiten één keer recht. Alleen verbreden, nooit inkorten; dezelfde
-- dagregel als de code: NL-kalenderdag, een eind om middernacht hoort bij de dag ervóór.
with bereik as (
  select pi.activiteit_id,
         min((pi.start_dt at time zone 'Europe/Amsterdam')::date)                              as van,
         max(((pi.eind_dt - interval '1 millisecond') at time zone 'Europe/Amsterdam')::date) as tot
  from public.planning_items pi
  group by pi.activiteit_id
)
update public.planning_activiteiten a
set gewenste_start = least(coalesce(a.gewenste_start, b.van), b.van),
    deadline       = greatest(coalesce(a.deadline, greatest(b.tot, b.van)), greatest(b.tot, b.van))
from bereik b
where b.activiteit_id = a.id
  and (a.gewenste_start is null or a.deadline is null
       or b.van < a.gewenste_start or greatest(b.tot, b.van) > a.deadline);
