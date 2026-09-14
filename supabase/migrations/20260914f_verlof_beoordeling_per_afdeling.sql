-- =====================================================================
-- Verlof beoordelen per afdeling in plaats van per persoon
-- =====================================================================
-- Verlof ging naar één aangewezen goedkeurder: de teamleider van de ploeg, anders de
-- terugvalgoedkeurder uit uren_instellingen. Omdat de meeste medewerkers in geen ploeg zitten
-- kwam vrijwel alles bij die ene persoon terecht; was die op vakantie, dan lag elke aanvraag stil
-- en kon niemand anders erbij.
--
-- Voortaan beoordeelt een AFDELING. Standaard: Uitvoering -> Projectbureau, al het overige ->
-- Directie. De koppeling is instelbaar op Instellingen > Uren.
--
-- De beoordelende afdeling wordt BEVROREN op de aanvraag. `medewerkers.afdeling` is vrij tekst en
-- verandert, en de routering is instelbaar; zonder bevriezing zou een lopende aanvraag na een
-- afdelingswissel of een instelwijziging ineens bij een andere groep liggen. Het scheelt bovendien
-- een join in elke poolquery.

-- ---------------------------------------------------------------------------
-- 1. De routering, als instelling
-- ---------------------------------------------------------------------------
-- Bewust een jsonb-kolom op de bestaande singleton en geen aparte tabel: de mapping is een handvol
-- regels, wordt bij aanvraag toch bevroren op de aanvraagrij en hoeft nooit in SQL bevraagd te
-- worden. Zo komt er ook geen RLS-policy bij.
alter table public.uren_instellingen
  add column if not exists verlof_routes jsonb not null default '{}'::jsonb;

comment on column public.uren_instellingen.verlof_routes is
  'Welke afdeling het verlof van welke afdeling beoordeelt: {"Uitvoering":"Projectbureau",...}. Sleutels en waarden zijn namen uit medewerker_afdelingen. Ontbreekt een afdeling, dan beoordeelt Directie.';

update public.uren_instellingen
   set verlof_routes = jsonb_build_object(
         'Uitvoering',    'Projectbureau',
         'Projectbureau', 'Directie',
         'Ondersteunend', 'Directie',
         'Directie',      'Directie')
 where id = true
   and verlof_routes = '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. De beoordelende afdeling op de aanvraag
-- ---------------------------------------------------------------------------
alter table public.verlof_aanvragen
  add column if not exists beoordelende_afdeling text;

comment on column public.verlof_aanvragen.beoordelende_afdeling is
  'Afdeling die deze aanvraag mag beoordelen, bevroren bij aanvraag. Leeg = val terug op goedkeurder_id (de oude persoonsroute).';
comment on column public.verlof_aanvragen.goedkeurder_id is
  'Alleen nog de uitzonderingsroute: persoonlijk aangewezen goedkeurder wanneer er geen beoordelende afdeling met leden is. Normale aanvragen lopen via beoordelende_afdeling.';

-- Vangnet voor rijen van vóór deze wijziging (de tabel is op dit moment leeg).
update public.verlof_aanvragen v
   set beoordelende_afdeling = case
         when lower(btrim(coalesce(m.afdeling, ''))) = 'uitvoering' then 'Projectbureau'
         else 'Directie'
       end
  from public.medewerkers m
 where m.id = v.medewerker_id
   and v.beoordelende_afdeling is null;

-- De oude partial index wees naar één persoon en dekt de poolquery niet meer.
drop index if exists public.verlof_aanvragen_open_idx;

create index if not exists verlof_aanvragen_open_afdeling_idx
  on public.verlof_aanvragen (beoordelende_afdeling, start_datum desc)
  where status = 'aangevraagd';

-- De uitzonderingsroute blijft ook gedekt (or-tak in de poolquery).
create index if not exists verlof_aanvragen_open_goedkeurder_idx
  on public.verlof_aanvragen (goedkeurder_id)
  where status = 'aangevraagd' and goedkeurder_id is not null;
