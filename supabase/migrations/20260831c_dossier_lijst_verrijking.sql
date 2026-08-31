-- Verrijkingsgegevens voor de dossier-overzichten in één view.
--
-- De borden (Aanvragen, Offertes, Opdrachten, Servicedesk, Afgesloten) tonen per kaart een
-- taken-teller, een notitie-indicator en de Intern-vlag. Die kwamen uit vier losse queries in
-- `lib/dossiers/actions.ts` (verrijkDossiers), waarbij álle taken en álle notities van de
-- getoonde dossiers werden opgehaald om ze vervolgens in JavaScript te tellen — bij 400+
-- opdrachten honderden kilobytes per paginabezoek, plus een `.in()` met 400+ uuid's in de URL.
--
-- Deze view telt hetzelfde in de database en levert één rij per dossier. Semantiek is
-- letterlijk overgenomen uit de oude JS-code:
--   * alleen hoofdtaken (parent_task_id is null);
--   * status 'vervallen' telt nergens mee;
--   * open = alles behalve 'gereed';
--   * een taak hangt aan een dossier via tasks.dossier_id (losse taak) óf via zijn actielijst;
--     coalesce zorgt dat een taak met beide paden precies één keer telt, met de directe
--     koppeling als winnaar — net als de dedup-set in de oude implementatie;
--   * sjabloonlijsten (is_template) tellen niet mee.
--
-- security_invoker + expliciete rechten: de view mag niet via PostgREST met de anon-sleutel
-- leesbaar zijn (notitie-inhoud is klantgegeven). EVA leest hem met de service-rolsleutel.

create or replace view public.dossier_lijst_verrijking
with (security_invoker = true) as
with taken as (
  select
    coalesce(t.dossier_id, tl.dossier_id) as dossier_id,
    t.status
  from public.tasks t
  left join public.task_lists tl
    on tl.id = t.lijst_id
   and tl.is_template = false
  where t.parent_task_id is null
    and t.status is distinct from 'vervallen'
    and coalesce(t.dossier_id, tl.dossier_id) is not null
),
taken_per_dossier as (
  select
    dossier_id,
    count(*)                                             as taken_totaal,
    count(*) filter (where status is distinct from 'gereed') as taken_open
  from taken
  group by dossier_id
),
notities_per_dossier as (
  select dossier_id, count(*) as aantal
  from public.dossier_notities
  group by dossier_id
),
notitie_nieuwste as (
  select distinct on (n.dossier_id)
    n.dossier_id,
    n.inhoud,
    n.created_at,
    nullif(btrim(regexp_replace(
      concat_ws(' ', m.voornaam, m.tussenvoegsel, m.achternaam), '\s+', ' ', 'g'
    )), '') as auteur
  from public.dossier_notities n
  left join public.medewerkers m on m.id = n.medewerker_id
  order by n.dossier_id, n.created_at desc
),
intern as (
  select distinct dt.dossier_id
  from public.dossier_toggles dt
  join public.dossier_toggle_definities dd on dd.id = dt.definitie_id
  where dt.aan
    and dd.sleutel = 'intern'
)
select
  d.id                                as dossier_id,
  coalesce(tpd.taken_open,   0)       as taken_open,
  coalesce(tpd.taken_totaal, 0)       as taken_totaal,
  coalesce(npd.aantal,       0)       as notitie_aantal,
  nn.inhoud                           as notitie_laatste_inhoud,
  nn.auteur                           as notitie_laatste_auteur,
  nn.created_at                       as notitie_laatste_op,
  (i.dossier_id is not null)          as intern
from public.dossiers d
left join taken_per_dossier  tpd on tpd.dossier_id = d.id
left join notities_per_dossier npd on npd.dossier_id = d.id
left join notitie_nieuwste   nn  on nn.dossier_id  = d.id
left join intern             i   on i.dossier_id   = d.id;

comment on view public.dossier_lijst_verrijking is
  'Taken-tellers, nieuwste notitie en Intern-vlag per dossier, voor de kaarten en lijsten op de dossier-overzichten. Zie lib/dossiers/actions.ts (verrijkDossiers).';

revoke all on public.dossier_lijst_verrijking from anon, authenticated;
grant select on public.dossier_lijst_verrijking to service_role;

-- Ondersteunende indexen voor de joins hierboven. `if not exists` zodat de migratie
-- herhaalbaar blijft; een index die al bestaat wordt stil overgeslagen.
create index if not exists tasks_dossier_id_idx      on public.tasks (dossier_id)      where parent_task_id is null;
create index if not exists tasks_lijst_id_idx        on public.tasks (lijst_id)        where parent_task_id is null;
create index if not exists dossier_notities_dossier_created_idx on public.dossier_notities (dossier_id, created_at desc);
