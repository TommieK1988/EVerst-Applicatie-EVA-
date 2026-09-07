-- De contracturen op een weekstaat zijn een momentopname: ze worden bij het aanmaken van de week
-- uit het dan geldende rooster overgenomen. Weken die zijn geopend voordat het rooster van de
-- medewerker bestond, staan daardoor blijvend op 0 en zijn niet in te dienen ("Er staan geen
-- contracturen voor je ingesteld"), ook nadat het rooster is ingevuld.
--
-- De code trekt de norm voortaan zelf bij zolang een week nog concept of afgekeurd is
-- (lib/uren/weekstaat.ts, actualiseerNorm). Deze migratie doet dat eenmalig voor de weken die er
-- al staan. Ingediende en goedgekeurde weken blijven met rust: daar hangt het
-- tijd-voor-tijdsaldo aan en dat mag niet met terugwerkende kracht verschuiven.
update public.uren_weken w
set contracturen = coalesce((
      select r.contracturen_per_week
      from public.medewerker_roosters r
      where r.medewerker_id = w.medewerker_id
        and r.geldig_vanaf <= w.week_start
        and (r.geldig_tot is null or r.geldig_tot >= w.week_start)
      order by r.geldig_vanaf desc
      limit 1
    ), 0)
where w.status in ('concept', 'afgekeurd')
  and w.contracturen is distinct from coalesce((
      select r.contracturen_per_week
      from public.medewerker_roosters r
      where r.medewerker_id = w.medewerker_id
        and r.geldig_vanaf <= w.week_start
        and (r.geldig_tot is null or r.geldig_tot >= w.week_start)
      order by r.geldig_vanaf desc
      limit 1
    ), 0);
