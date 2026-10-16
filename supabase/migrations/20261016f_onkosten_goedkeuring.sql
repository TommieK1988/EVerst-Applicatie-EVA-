-- ---------------------------------------------------------------------------
-- Onkosten: goedkeuring door de projectleider
-- ---------------------------------------------------------------------------
-- Een kostenpost had geen eigen goedkeuring: hij lag vast zodra er van die dag een uurregel was
-- goedgekeurd, en daarmee was niet te zien of iemand de bon zelf had bekeken. Vanaf nu keurt de
-- projectleider van het dossier waar de kosten voor gemaakt zijn ze goed of af, net zoals hij de
-- uren op zijn project beoordeelt -- het is zijn budget.
--
--   kostenpost op een project       -> de projectleider van dat dossier
--   zonder project, of geen PL       -> de eigen goedkeurder van de medewerker
--                                       (medewerkers.uren_goedkeurder_id, anders
--                                       uren_instellingen.niet_gewerkt_goedkeurder_id)
--
-- Wie er aan zet is wordt niet op de rij bevroren maar uit het dossier afgeleid
-- (lib/uren/onkosten-goedkeuring.ts), zelfde keuze als bij de uren: wisselt de projectleider,
-- dan schuift wat nog open staat mee naar de nieuwe.
--
-- Een kostenpost komt pas in iemands lijst als de week is ingediend. Daarvoor is het een
-- concept van de medewerker zelf.

-- 1. Kolommen ----------------------------------------------------------------
-- beoordeeld_door bewust zonder foreign key. Een tweede verwijzing van uren_onkosten naar
-- medewerkers maakt elke bestaande embed `medewerkers(...)` op deze tabel dubbelzinnig, en
-- PostgREST weigert die dan (PGRST201). Zonder FK blijft draaiende code werken, ook als deze
-- migratie vóór de nieuwe code live gaat. De naam zoekt de code zelf op.
alter table public.uren_onkosten
  add column if not exists goedkeuring_status text not null default 'open',
  add column if not exists beoordeeld_op timestamptz,
  add column if not exists beoordeeld_door uuid,
  add column if not exists afkeur_reden text;

alter table public.uren_onkosten
  drop constraint if exists uren_onkosten_goedkeuring_status;
alter table public.uren_onkosten
  add constraint uren_onkosten_goedkeuring_status
    check (goedkeuring_status in ('open', 'goedgekeurd', 'afgekeurd'));

-- Een beoordeling zonder moment, of een afkeuring zonder reden, is geen beoordeling: de
-- medewerker moet kunnen lezen waarom zijn bon niet wordt vergoed.
alter table public.uren_onkosten
  drop constraint if exists uren_onkosten_beoordeling_compleet;
alter table public.uren_onkosten
  add constraint uren_onkosten_beoordeling_compleet check (
    goedkeuring_status = 'open'
    or (
      beoordeeld_op is not null
      and (goedkeuring_status <> 'afgekeurd' or nullif(btrim(afkeur_reden), '') is not null)
    )
  );

comment on column public.uren_onkosten.goedkeuring_status is
  'open -> goedgekeurd | afgekeurd. Beoordeeld door de projectleider van het dossier, of zonder project door de eigen goedkeurder van de medewerker. Een beoordeelde kostenpost ligt vast.';
comment on column public.uren_onkosten.dossier_id is
  'Het project waarvoor de kosten gemaakt zijn; bepaalt welke projectleider ze goedkeurt. Leeg = geen project, dan de eigen goedkeurder.';

-- De werklijst van de beoordelaars: alleen wat nog open staat.
create index if not exists uren_onkosten_open_idx on public.uren_onkosten (dossier_id)
  where goedkeuring_status = 'open';

-- 2. Bestaande kostenposten ---------------------------------------------------
-- Tot nu toe koos niemand een project bij een kostenpost. Waar de uren van die dag op precies
-- één echt project staan, is dat het project van de kosten; anders blijft het leeg en gaat de
-- post naar de eigen goedkeurder. Indirecte-urenprojecten (overhead) tellen niet als project.
with indirect as (
  select unnest(coalesce(indirecte_dossier_ids, '{}'::uuid[])) as id from public.uren_instellingen
  union select extern_kantoor_dossier_id from public.uren_instellingen
  union select indirect_uren_dossier_id from public.bedrijfsgegevens
  union select indirect_gewerkt_dossier_id from public.bedrijfsgegevens
),
per_dag as (
  select r.week_id, r.datum, (array_agg(distinct r.dossier_id))[1] as dossier_id
  from public.uren_regels r
  join public.planning_uursoorten u on u.id = r.uursoort_id
  where u.uren_categorie = 'werk'
    and r.dossier_id is not null
    and not exists (select 1 from indirect i where i.id = r.dossier_id)
  group by r.week_id, r.datum
  having count(distinct r.dossier_id) = 1
)
update public.uren_onkosten o
   set dossier_id = p.dossier_id
  from per_dag p
 where o.dossier_id is null
   and o.week_id = p.week_id
   and o.datum = p.datum;

-- Kosten in een week die al helemaal is goedgekeurd lagen onder de oude regel vast met de uren
-- van die week. Die gelden als goedgekeurd; zonder beoordelaar, want niemand heeft er als
-- kostenpost naar gekeken.
update public.uren_onkosten o
   set goedkeuring_status = 'goedgekeurd',
       beoordeeld_op = coalesce(w.tl_beoordeeld_op, w.updated_at)
  from public.uren_weken w
 where w.id = o.week_id
   and w.status = 'goedgekeurd'
   and o.goedkeuring_status = 'open';
