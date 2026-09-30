-- Eén bron voor "op welk bord staat dit dossier" (30-09-2026).
--
-- Tot nu toe had elk van de vier borden (Aanvragen, Offertes, Opdrachten, Servicedesk) zijn eigen
-- filter op Bouw7-status, categorie en hoofdstatus. Die filters sloten elkaar niet sluitend uit:
-- een combinatie die in geen enkel filter paste (LB met een verkeerde categorie, een opdracht op
-- 08, een gewonnen offerte met een verouderde statuskopie) viel stil van álle borden.
--
-- `bord` legt de indeling één keer vast. Elk dossier krijgt er precies één, en de borden filteren
-- er alleen nog op. Regels, in volgorde (de eerste die past wint):
--
--   1. categorie Dagelijks onderhoud / Mutatie, of Bouw7 'LB.'      → servicedesk
--   2. Bouw7 '07.' Financieel afgesloten                            → afgesloten
--   3. Bouw7 '02.'–'06.'                                            → opdrachten
--   4. Bouw7 '09.' Verzonden offertes                               → offertes
--   5. Bouw7 '08.' Afgewezen                                        → aanvragen (hoofdstatus aanvraag), anders offertes
--   6. Bouw7 '01.' Offerte                                          → aanvragen
--   7. Bouw7 '00.' Intern (containers voor indirecte uren)          → intern (geen werkbord)
--   8. geen of onbekende Bouw7-status (Gilde, nog niet gesynct)     → volgt de hoofdstatus
--
-- Een trigger en geen generated column: de statuskolommen zijn enums, en een enum→text-cast is
-- voor Postgres niet immutable genoeg voor een generated column.
--
-- Daarnaast twee stempels voor de 7-dagenvensters op de eindkolommen:
--   * substatus_gewijzigd_op — alleen als hoofdstatus of een substatus écht wijzigt. Een losse
--     update van bv. de titel stempelt niets (zie de gewonnen-promotie-valkuil).
--   * gewonnen_op            — het moment dat een offerte een opdracht werd.

alter table public.dossiers
  add column if not exists bord text,
  add column if not exists categorie_conflict boolean not null default false,
  add column if not exists substatus_gewijzigd_op timestamptz,
  add column if not exists gewonnen_op timestamptz;

comment on column public.dossiers.bord is
  'Op welk bord het dossier staat: aanvragen | offertes | opdrachten | servicedesk | afgesloten | intern. Afgeleid door trigger zz_dossier_bord uit Bouw7-status, categorie en hoofdstatus.';
comment on column public.dossiers.categorie_conflict is
  'Bouw7-status LB. Lopende bonnen met een categorie anders dan Dagelijks onderhoud/Mutatie. Hoort niet te bestaan; het dossier blijft op Servicedesk met een waarschuwing.';
comment on column public.dossiers.substatus_gewijzigd_op is
  'Laatste echte wijziging van hoofdstatus of een substatus. Bron voor het 7-dagenvenster op eindkolommen.';
comment on column public.dossiers.gewonnen_op is
  'Moment waarop de offerte een opdracht werd. Houdt het dossier 7 dagen in Offertes → Gewonnen.';

create or replace function public.dossier_bord(
  p_categorie   text,
  p_status      text,
  p_hoofdstatus text,
  p_opdracht_substatus text
) returns text
language sql
immutable
as $$
  select case
    when trim(coalesce(p_categorie, '')) in ('Dagelijks onderhoud', 'Mutatie')
      or p_status like 'LB.%'                 then 'servicedesk'
    when p_status like '07.%'                 then 'afgesloten'
    when p_status ~ '^0[2-6]\.'               then 'opdrachten'
    when p_status like '09.%'                 then 'offertes'
    when p_status like '08.%'                 then case when p_hoofdstatus = 'aanvraag' then 'aanvragen' else 'offertes' end
    when p_status like '01.%'                 then 'aanvragen'
    when p_status like '00.%'                 then 'intern'
    when p_hoofdstatus = 'offerte'            then 'offertes'
    when p_hoofdstatus = 'opdracht'           then
      case when p_opdracht_substatus = 'financieel_afgesloten' then 'afgesloten' else 'opdrachten' end
    else 'aanvragen'
  end
$$;

create or replace function public.tg_dossier_bord()
returns trigger
language plpgsql
as $$
begin
  new.bord := public.dossier_bord(
    new.bouw7_categorie_naam, new.bouw7_projectstatus_naam,
    new.hoofdstatus::text, new.opdracht_substatus::text);

  new.categorie_conflict := coalesce(new.bouw7_projectstatus_naam like 'LB.%', false)
    and trim(coalesce(new.bouw7_categorie_naam, '')) not in ('Dagelijks onderhoud', 'Mutatie');

  if tg_op = 'INSERT' then
    new.substatus_gewijzigd_op := coalesce(new.substatus_gewijzigd_op, now());
  elsif (old.hoofdstatus, old.aanvraag_substatus, old.offerte_substatus,
         old.opdracht_substatus, old.servicedesk_substatus)
     is distinct from
        (new.hoofdstatus, new.aanvraag_substatus, new.offerte_substatus,
         new.opdracht_substatus, new.servicedesk_substatus) then
    new.substatus_gewijzigd_op := now();
  end if;

  -- Draait na dossier_status_change (alfabetisch), dus ziet de promotie offerte/gewonnen →
  -- opdracht/nieuwe_opdracht al. Ook een Bouw7-sprong van 09 naar 02 telt als gewonnen.
  if tg_op = 'UPDATE' and old.hoofdstatus = 'offerte' and new.hoofdstatus = 'opdracht' then
    new.gewonnen_op := now();
  end if;

  return new;
end;
$$;

drop trigger if exists zz_dossier_bord on public.dossiers;
create trigger zz_dossier_bord
  before insert or update on public.dossiers
  for each row execute function public.tg_dossier_bord();

-- Backfill zonder de andere triggers: een update op alle dossiers zou anders updated_at
-- verschuiven (lijsten sorteren daarop), trigger-events loggen en de gewonnen-promotie kunnen
-- laten vuren. Alleen zz_dossier_bord zelf mag hier niet uit, maar die doet het werk al niet
-- beter dan deze update — dus alles uit, zelf invullen.
alter table public.dossiers disable trigger user;

update public.dossiers set
  bord = public.dossier_bord(bouw7_categorie_naam, bouw7_projectstatus_naam,
                             hoofdstatus::text, opdracht_substatus::text),
  categorie_conflict = coalesce(bouw7_projectstatus_naam like 'LB.%', false)
    and trim(coalesce(bouw7_categorie_naam, '')) not in ('Dagelijks onderhoud', 'Mutatie');

-- Gewonnen in de afgelopen twee weken: die promotie staat betrouwbaar in de statushistorie
-- (één rij per echte overgang offerte → opdracht). Ouder is voor het venster niet meer relevant.
update public.dossiers d set gewonnen_op = h.op
from (
  select dossier_id, max(op) as op
  from public.dossier_status_historie
  where van_hoofdstatus = 'offerte' and naar_hoofdstatus = 'opdracht'
    and op >= now() - interval '14 days'
  group by dossier_id
) h
where h.dossier_id = d.id and d.hoofdstatus = 'opdracht';

alter table public.dossiers enable trigger user;

alter table public.dossiers alter column bord set not null;

create index if not exists dossiers_bord_idx on public.dossiers (bord);
