-- Extern personeel (ZZP) heeft geen werkmaatschappij nodig. Ze boeken alleen gewerkte uren:
-- geen verlof, geen norm en dus ook geen tijd-voor-tijdsaldo. Wie op een kantoorafdeling zit
-- boekt op één vast kantoorproject.

alter table public.uren_instellingen
  add column if not exists extern_kantoor_dossier_id uuid
    references public.dossiers(id) on delete restrict;

comment on column public.uren_instellingen.extern_kantoor_dossier_id is
  'Project voor de gewerkte uren van externen op een kantoorafdeling (zie indirecte_afdelingen).';

-- Geen norm = geen saldo: een ZZP''er bouwt geen tijd voor tijd op. Zonder dit telde elke
-- gewerkte week van een extern als overuren (of, met een rooster, als tekort).
create or replace view public.uren_week_saldo as
 select w.id as week_id,
    w.medewerker_id,
    w.jaar,
    w.week_nr,
    w.week_start,
    w.contracturen,
    coalesce(sum(r.uren), 0::numeric) as totaal_uren,
    case when m.extern then 0::numeric
      else coalesce(sum(r.uren) filter (where u.uren_categorie is distinct from 'tijd_voor_tijd'::text), 0::numeric) - w.contracturen
    end as saldo_mutatie
   from uren_weken w
     join medewerkers m on m.id = w.medewerker_id
     left join uren_regels r on r.week_id = w.id
     left join planning_uursoorten u on u.id = r.uursoort_id
  where w.status = 'goedgekeurd'::text
  group by w.id, m.extern;
