-- Kwaliteitscontrole buitenschil — periodieke inspectie van vastgoedonderhoud.
--
-- Een opzichter loopt ongeveer eens per twee weken een ronde over een lopende opdracht. Hij kiest
-- welke disciplines op dat moment zichtbaar en beoordeelbaar zijn, krijgt alleen de bijbehorende
-- controlepunten te zien, meet waar dat technisch zinvol is, en legt afwijkingen met foto vast.
-- De kwaliteitseis zelf (grenswaarde, tolerantie, bron) zit in de bibliotheek, niet in het hoofd
-- van de opzichter en niet in de broncode.
--
-- ONTWERPKEUZES
--
-- 1. Eigen tabellen, geen formuliersjabloon. De Formulieren-module kan condities ("toon alleen bij
--    discipline X") maar geen grenswaarde-toetsing, geen vijf statussen met verplichtingen, geen
--    bronvermelding per punt en geen afwijking die over inspecties heen wordt bewaakt. Bovendien
--    zijn ~170 controlepunten met handmatige condities in een drag-and-drop bouwer niet te
--    onderhouden: een hernoemde discipline breekt stil de helft van de condities.
--
-- 2. Eigen afwijkingenregister, bewust NIET oplever_punten hergebruiken. Overwogen (die tabel is in
--    20260717 al gegeneraliseerd met een soort-kolom), maar een kwaliteitsafwijking draagt
--    discipline, controlepunt, gemeten waarde, technische eis, ernst en hercontrole — zes velden
--    die voor een opleverpunt betekenisloos zijn. Expliciete keuze van de opdrachtgever.
--
-- 3. Geen aparte locatietabel. Er wordt op DISCIPLINE geselecteerd; de locatie ("voorgevel",
--    "blok A", "woningen 21 t/m 28") hoort bij een bevinding en staat als tekst op de afwijking.
--    Daardoor kan hetzelfde controlepunt op twee gevels misgaan zonder dat het resultaat dubbel
--    wordt vastgelegd.
--
-- 4. toegepaste_eis (jsonb) op het resultaat is een SNAPSHOT van de eis die op het inspectiemoment
--    gold. Wie later een grenswaarde in de bibliotheek bijstelt, verandert daarmee geen verzonden
--    rapport met terugwerkende kracht. Zelfde gedachte als het bevroren form_versies.schema.
--
-- 5. Grenswaarden worden geseed als bron_type INTERN (bedrijfsnorm) met de herkomst als tekst in
--    bron_document. Pas als iemand de norm daadwerkelijk heeft nageslagen mag een punt op NORM.
--    Zo belandt er nooit een niet-geverifieerde NEN/BRL-claim in een klantrapport.
--
-- 6. Generiek genoeg voor later: kwaliteit_disciplines.groep staat nu op buitenschil, zodat een
--    tweede groep (binnenverbouwing: tegelwerk, stucwerk binnen, plafonds, vloerafwerking) later
--    puur seed-data is en geen migratie vraagt.
--
-- Deze migratie is puur ADDITIEF; de enige wijziging aan bestaand werk is een booleaanse kolom op
-- public.tasks.

-- ── Gedeelde updated_at-trigger voor deze module ─────────────────────────────
-- `set search_path = public` op alle functies van deze module: zonder dat is het zoekpad
-- rol-afhankelijk en kan een schema eerder in het pad een tabel- of functienaam kapen.
create or replace function public.kwaliteit_touch_updated_at()
returns trigger language plpgsql
set search_path = public
as $fn$
begin
  new.updated_at := now();
  return new;
end $fn$;

-- ── 1. Disciplines ───────────────────────────────────────────────────────────
create table if not exists public.kwaliteit_disciplines (
  code        text primary key,
  naam        text not null,
  groep       text not null default 'buitenschil',
  volgorde    integer not null default 0,
  actief      boolean not null default true,
  altijd_aan  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.kwaliteit_disciplines is
  'De werksoorten waaruit de opzichter kiest bij het starten van een kwaliteitsronde.';
comment on column public.kwaliteit_disciplines.groep is
  'buitenschil = onderhoud/renovatie aan gevel en dak. Een tweede groep (binnenverbouwing) is puur seed-data.';
comment on column public.kwaliteit_disciplines.altijd_aan is
  'true voor Algemeen: die discipline staat elke ronde aan en is niet uit te zetten.';

drop trigger if exists trg_kwaliteit_disciplines_updated on public.kwaliteit_disciplines;
create trigger trg_kwaliteit_disciplines_updated
  before update on public.kwaliteit_disciplines
  for each row execute function public.kwaliteit_touch_updated_at();

-- ── 2. Controlepunten-bibliotheek ────────────────────────────────────────────
create table if not exists public.kwaliteit_controlepunten (
  id                         uuid primary key default gen_random_uuid(),
  code                       text not null unique,
  discipline_code            text not null references public.kwaliteit_disciplines(code) on delete restrict,
  component                  text,
  subcomponent               text,
  titel                      text not null,
  korte_vraag                text not null,
  toelichting                text,

  inspectie_type             text not null default 'visueel'
                               check (inspectie_type in ('visueel','meting','functioneel','document','gecombineerd')),
  kwaliteitsaspect           text not null default 'technisch'
                               check (kwaliteitsaspect in ('technisch','functioneel','esthetisch','veiligheid')),

  -- Binaire controle: legt vast of JA of NEE het goede antwoord is. Zonder dit veld zou de UI per
  -- punt moeten weten dat "zijn er kale plekken?" met NEE goed is en "functioneert het slot?" met
  -- JA -- precies de kennis die niet in componenten thuishoort.
  binair_voldoet_bij         text check (binair_voldoet_bij in ('ja','nee')),

  meting_verplicht           boolean not null default false,
  meting_optioneel           boolean not null default false,
  meetmethode                text,
  meetmiddel                 text,
  eenheid                    text,
  min_waarde                 numeric(12,3),
  max_waarde                 numeric(12,3),
  doel_waarde                numeric(12,3),
  tolerantie_min             numeric(12,3),
  tolerantie_plus            numeric(12,3),

  project_eis_sleutel        text,

  acceptatie_regel           text,
  afkeur_regel               text,

  bron_type                  text not null default 'INTERN'
                               check (bron_type in ('NORM','FABRIKANT','PROJECT','INTERN')),
  bron_document              text,
  bron_versie                text,
  bron_paragraaf             text,
  bron_omschrijving          text,
  eis_tekst                  text,

  foto_verplicht_bij_afkeur  boolean not null default true,
  foto_altijd_verplicht      boolean not null default false,
  sta_niet_beoordeeld        boolean not null default true,
  sta_nvt                    boolean not null default true,
  sta_nader_onderzoek        boolean not null default true,

  standaard_ernst            text not null default 'technisch'
                               check (standaard_ernst in ('kritiek','technisch','esthetisch','observatie')),

  rapport_tekst_voldoet      text,
  rapport_tekst_voldoet_niet text,
  standaard_herstelactie     text,

  volgorde                   integer not null default 0,
  actief                     boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

comment on table public.kwaliteit_controlepunten is
  'De technische kwaliteitsbibliotheek: per controlepunt de vraag, de eis, de meetmethode, de bron en de standaard rapporttekst.';
comment on column public.kwaliteit_controlepunten.code is
  'Natuurlijke sleutel (SCH-01, KIT-03). Maakt de seed idempotent en de bibliotheek herkenbaar in rapportages.';
comment on column public.kwaliteit_controlepunten.binair_voldoet_bij is
  'ja = het antwoord JA betekent VOLDOET; nee = het antwoord NEE betekent VOLDOET. Null bij een punt dat niet binair is.';
comment on column public.kwaliteit_controlepunten.project_eis_sleutel is
  'Verwijst naar kwaliteit_project_eisen.sleutel. Is er voor dit dossier een projectwaarde, dan overschrijft die de grenswaarden hier.';
comment on column public.kwaliteit_controlepunten.bron_type is
  'INTERN = eigen bedrijfsnorm (ook wanneer die op een norm is gebaseerd maar niet is geverifieerd); NORM = nageslagen norm; FABRIKANT = productblad; PROJECT = bestek/projectafspraak.';
comment on column public.kwaliteit_controlepunten.meting_verplicht is
  'true = zonder meetwaarde mag dit punt niet op VOLDOET. Een niet-uitgevoerde meting is nooit een akkoord.';

create index if not exists idx_kwaliteit_controlepunten_discipline
  on public.kwaliteit_controlepunten (discipline_code, volgorde) where actief;

drop trigger if exists trg_kwaliteit_controlepunten_updated on public.kwaliteit_controlepunten;
create trigger trg_kwaliteit_controlepunten_updated
  before update on public.kwaliteit_controlepunten
  for each row execute function public.kwaliteit_touch_updated_at();

-- ── 3. Nummering ─────────────────────────────────────────────────────────────
-- Bewust WEL in de migratie vastgelegd. De bestaande quote_volgnummer-sequence staat alleen in de
-- database en in geen enkele migratie; dat willen we hier niet herhalen.
create sequence if not exists public.kwaliteit_inspectie_volgnummer;
create sequence if not exists public.kwaliteit_afwijking_volgnummer;

create or replace function public.volgend_kwaliteit_inspectienummer()
returns text language sql volatile
set search_path = public
as $fn$
  select 'KC-' || to_char(now(),'YYYY') || '-'
    || lpad(nextval('public.kwaliteit_inspectie_volgnummer')::text, 3, '0');
$fn$;

create or replace function public.volgend_kwaliteit_afwijkingnummer()
returns text language sql volatile
set search_path = public
as $fn$
  select 'KA-' || to_char(now(),'YYYY') || '-'
    || lpad(nextval('public.kwaliteit_afwijking_volgnummer')::text, 3, '0');
$fn$;

-- ── 4. Inspecties ────────────────────────────────────────────────────────────
create table if not exists public.kwaliteit_inspecties (
  id                         uuid primary key default gen_random_uuid(),
  inspectienummer            text not null unique default public.volgend_kwaliteit_inspectienummer(),
  dossier_id                 uuid not null references public.dossiers(id) on delete cascade,
  task_id                    uuid references public.tasks(id) on delete set null,
  datum                      date not null default current_date,
  tijd                       time,
  inspecteur_id              uuid references public.medewerkers(id) on delete set null,
  weer                       text,
  werkzaamheden_omschrijving text,
  gebied_omschrijving        text,
  discipline_codes           text[] not null default array['ALG']::text[],
  algemene_opmerkingen       text,
  steekproef_bekeken         integer,
  steekproef_afwijkend       integer,
  status                     text not null default 'concept' check (status in ('concept','definitief')),
  definitief_op              timestamptz,
  definitief_door            uuid references public.medewerkers(id) on delete set null,
  heropend_op                timestamptz,
  heropend_door              uuid references public.medewerkers(id) on delete set null,
  heropen_reden              text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  created_by                 uuid
);

comment on table public.kwaliteit_inspecties is
  'Een kwaliteitsronde op een opdracht. Zolang de status concept is, is de inspectie het werkdocument van de opzichter; definitief maakt hem alleen-lezen.';
comment on column public.kwaliteit_inspecties.task_id is
  'De actie uit de actielijst waaruit deze ronde is gestart. Bij afronden gaat die actie automatisch op gereed.';
comment on column public.kwaliteit_inspecties.gebied_omschrijving is
  'Optioneel: welk deel van het project is gelopen. De concrete locaties staan bij de bevindingen.';

create index if not exists idx_kwaliteit_inspecties_dossier on public.kwaliteit_inspecties (dossier_id, datum desc);
create index if not exists idx_kwaliteit_inspecties_task    on public.kwaliteit_inspecties (task_id) where task_id is not null;

drop trigger if exists trg_kwaliteit_inspecties_updated on public.kwaliteit_inspecties;
create trigger trg_kwaliteit_inspecties_updated
  before update on public.kwaliteit_inspecties
  for each row execute function public.kwaliteit_touch_updated_at();

-- ── 5. Resultaten ────────────────────────────────────────────────────────────
create table if not exists public.kwaliteit_resultaten (
  id               uuid primary key default gen_random_uuid(),
  inspectie_id     uuid not null references public.kwaliteit_inspecties(id) on delete cascade,
  controlepunt_id  uuid not null references public.kwaliteit_controlepunten(id) on delete restrict,
  status           text not null
                     check (status in ('voldoet','voldoet_niet','niet_beoordeeld','nvt','nader_onderzoek')),
  antwoord         text check (antwoord in ('ja','nee')),
  gemeten_waarde   numeric(12,3),
  gemeten_waarde_2 numeric(12,3),
  gemeten_waarde_3 numeric(12,3),
  meetlocatie      text,
  meetmiddel       text,
  berekend_voldoet boolean,
  toegepaste_eis   jsonb not null default '{}'::jsonb,
  opmerking        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  unique (inspectie_id, controlepunt_id)
);

comment on table public.kwaliteit_resultaten is
  'Een rij per beoordeeld controlepunt binnen een inspectie. Punten die de opzichter niet aanraakt krijgen geen rij; niet beoordeeld is dus iets anders dan overgeslagen.';
comment on column public.kwaliteit_resultaten.toegepaste_eis is
  'Snapshot van de eis die op het inspectiemoment gold (min/max/doel/tolerantie/eenheid/bron). Bijstellen in de bibliotheek verandert geen verzonden rapport.';
comment on column public.kwaliteit_resultaten.berekend_voldoet is
  'De uitkomst van de rekenregel. Null wanneer er niets te rekenen viel (geen meting, geen binair antwoord).';

create index if not exists idx_kwaliteit_resultaten_inspectie on public.kwaliteit_resultaten (inspectie_id);

drop trigger if exists trg_kwaliteit_resultaten_updated on public.kwaliteit_resultaten;
create trigger trg_kwaliteit_resultaten_updated
  before update on public.kwaliteit_resultaten
  for each row execute function public.kwaliteit_touch_updated_at();

-- ── 6. Positieve kwaliteitswaarnemingen ──────────────────────────────────────
-- Het rapport mag niet uitsluitend fouten tonen; wat goed gaat hoort er net zo goed in.
create table if not exists public.kwaliteit_waarnemingen (
  id              uuid primary key default gen_random_uuid(),
  inspectie_id    uuid not null references public.kwaliteit_inspecties(id) on delete cascade,
  discipline_code text references public.kwaliteit_disciplines(code) on delete set null,
  locatie         text,
  omschrijving    text not null,
  created_at      timestamptz not null default now(),
  created_by      uuid
);

comment on table public.kwaliteit_waarnemingen is
  'Positieve kwaliteitswaarneming: strak schilderwerk, nette kitvoeg, correct dakdetail. Verschijnt met foto in het klantrapport.';

create index if not exists idx_kwaliteit_waarnemingen_inspectie on public.kwaliteit_waarnemingen (inspectie_id);

-- ── 7. Afwijkingenregister ───────────────────────────────────────────────────
create table if not exists public.kwaliteit_afwijkingen (
  id                              uuid primary key default gen_random_uuid(),
  afwijkingsnummer                text not null unique default public.volgend_kwaliteit_afwijkingnummer(),
  dossier_id                      uuid not null references public.dossiers(id) on delete cascade,
  inspectie_id                    uuid not null references public.kwaliteit_inspecties(id) on delete cascade,
  resultaat_id                    uuid references public.kwaliteit_resultaten(id) on delete cascade,
  controlepunt_id                 uuid references public.kwaliteit_controlepunten(id) on delete set null,
  controlepunt_code               text,
  discipline_code                 text,
  locatie                         text,
  datum_constatering              date not null default current_date,
  inspecteur_id                   uuid references public.medewerkers(id) on delete set null,
  eis_tekst                       text,
  gemeten_waarde                  numeric(12,3),
  eenheid                         text,
  status                          text not null default 'open'
                                    check (status in ('open','gemeld','herstel_gepland','in_uitvoering',
                                                      'gereed_voor_hercontrole','hersteld_akkoord',
                                                      'niet_akkoord','nader_onderzoek','geaccepteerde_afwijking')),
  ernst                           text not null default 'technisch'
                                    check (ernst in ('kritiek','technisch','esthetisch','observatie')),
  omschrijving                    text,
  voorgestelde_actie              text,
  verantwoordelijke_type          text check (verantwoordelijke_type in ('medewerker','relatie')),
  verantwoordelijke_medewerker_id uuid references public.medewerkers(id) on delete set null,
  verantwoordelijke_relatie_id    uuid references public.relaties(id) on delete set null,
  gewenste_hersteldatum           date,
  herstelopmerking                text,
  hercontrole_inspectie_id        uuid references public.kwaliteit_inspecties(id) on delete set null,
  hercontrole_datum               date,
  hercontroleur_id                uuid references public.medewerkers(id) on delete set null,
  vergrendeld                     boolean not null default false,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  created_by                      uuid
);

comment on table public.kwaliteit_afwijkingen is
  'Kwaliteitsafwijking uit een inspectie. 1..n per resultaat: hetzelfde controlepunt kan op meerdere gevels misgaan, elk met een eigen locatie en foto.';
comment on column public.kwaliteit_afwijkingen.vergrendeld is
  'true zodra de inspectie definitief is. Zolang de inspectie concept is mag de opzichter een bevinding nog weghalen.';
comment on column public.kwaliteit_afwijkingen.controlepunt_code is
  'Gekopieerde code (SCH-07). Blijft leesbaar in het register wanneer een controlepunt later uit de bibliotheek verdwijnt.';

create index if not exists idx_kwaliteit_afwijkingen_dossier   on public.kwaliteit_afwijkingen (dossier_id, status);
create index if not exists idx_kwaliteit_afwijkingen_inspectie on public.kwaliteit_afwijkingen (inspectie_id);
create index if not exists idx_kwaliteit_afwijkingen_resultaat on public.kwaliteit_afwijkingen (resultaat_id);

drop trigger if exists trg_kwaliteit_afwijkingen_updated on public.kwaliteit_afwijkingen;
create trigger trg_kwaliteit_afwijkingen_updated
  before update on public.kwaliteit_afwijkingen
  for each row execute function public.kwaliteit_touch_updated_at();

-- ── 8. Audit trail op de afwijkingsstatus ────────────────────────────────────
create table if not exists public.kwaliteit_afwijking_historie (
  id           uuid primary key default gen_random_uuid(),
  afwijking_id uuid not null references public.kwaliteit_afwijkingen(id) on delete cascade,
  van_status   text,
  naar_status  text not null,
  opmerking    text,
  door         uuid references public.medewerkers(id) on delete set null,
  op           timestamptz not null default now()
);

create index if not exists idx_kwaliteit_afwijking_historie on public.kwaliteit_afwijking_historie (afwijking_id, op desc);

-- Statuswijziging altijd loggen, ongeacht via welk scherm hij binnenkomt. Zelfde gedachte als
-- tg_dossier_status_change(): de historie mag niet afhangen van de applicatiecode die toevallig
-- schrijft.
create or replace function public.tg_kwaliteit_afwijking_historie()
returns trigger language plpgsql
set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' then
    insert into public.kwaliteit_afwijking_historie (afwijking_id, van_status, naar_status, opmerking, door)
      values (new.id, null, new.status, 'Geconstateerd', new.inspecteur_id);
  elsif new.status is distinct from old.status then
    insert into public.kwaliteit_afwijking_historie (afwijking_id, van_status, naar_status, opmerking)
      values (new.id, old.status, new.status, new.herstelopmerking);
  end if;
  return new;
end $fn$;

drop trigger if exists trg_kwaliteit_afwijking_historie on public.kwaliteit_afwijkingen;
create trigger trg_kwaliteit_afwijking_historie
  after insert or update on public.kwaliteit_afwijkingen
  for each row execute function public.tg_kwaliteit_afwijking_historie();

-- ── 9. Projecteisen ──────────────────────────────────────────────────────────
-- Zelfde VORM als de eis op een controlepunt, zodat het overschrijven een merge is en geen
-- if-else per discipline.
create table if not exists public.kwaliteit_project_eisen (
  id              uuid primary key default gen_random_uuid(),
  dossier_id      uuid not null references public.dossiers(id) on delete cascade,
  sleutel         text not null,
  label           text not null,
  waarde_tekst    text,
  min_waarde      numeric(12,3),
  max_waarde      numeric(12,3),
  doel_waarde     numeric(12,3),
  tolerantie_min  numeric(12,3),
  tolerantie_plus numeric(12,3),
  eenheid         text,
  eis_tekst       text,
  bron_type       text not null default 'PROJECT'
                    check (bron_type in ('NORM','FABRIKANT','PROJECT','INTERN')),
  bron_document   text,
  notitie         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (dossier_id, sleutel)
);

comment on table public.kwaliteit_project_eisen is
  'Per project vastgelegde kwaliteitswaarden (verfsysteem, coatingsysteem, kitsoort, toleranties). Overschrijft de generieke grenswaarde uit de bibliotheek.';

drop trigger if exists trg_kwaliteit_project_eisen_updated on public.kwaliteit_project_eisen;
create trigger trg_kwaliteit_project_eisen_updated
  before update on public.kwaliteit_project_eisen
  for each row execute function public.kwaliteit_touch_updated_at();

-- ── 10. Referentievlakken ────────────────────────────────────────────────────
create table if not exists public.kwaliteit_referentievlakken (
  id               uuid primary key default gen_random_uuid(),
  dossier_id       uuid not null references public.dossiers(id) on delete cascade,
  discipline_code  text references public.kwaliteit_disciplines(code) on delete set null,
  omschrijving     text not null,
  locatie          text,
  datum            date not null default current_date,
  goedgekeurd_door text,
  kleur            text,
  voegprofiel      text,
  structuur        text,
  meetwaarden      jsonb not null default '{}'::jsonb,
  foto_urls        text[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid
);

comment on table public.kwaliteit_referentievlakken is
  'Goedgekeurd proefvlak per project en discipline. De inspecteur vergelijkt kleur, profiel en structuur hiermee in plaats van met zijn geheugen.';

create index if not exists idx_kwaliteit_referentievlakken_dossier on public.kwaliteit_referentievlakken (dossier_id);

drop trigger if exists trg_kwaliteit_referentievlakken_updated on public.kwaliteit_referentievlakken;
create trigger trg_kwaliteit_referentievlakken_updated
  before update on public.kwaliteit_referentievlakken
  for each row execute function public.kwaliteit_touch_updated_at();

-- ── 11. Foto's ───────────────────────────────────────────────────────────────
-- Vier nullable koppelingen met een CHECK dat er precies een gevuld is: hetzelfde patroon als
-- dossiers_status_consistent. Een koppel_soort + koppel_id-paar zou de foreign keys opgeven.
create table if not exists public.kwaliteit_fotos (
  id            uuid primary key default gen_random_uuid(),
  inspectie_id  uuid references public.kwaliteit_inspecties(id) on delete cascade,
  resultaat_id  uuid references public.kwaliteit_resultaten(id) on delete cascade,
  afwijking_id  uuid references public.kwaliteit_afwijkingen(id) on delete cascade,
  waarneming_id uuid references public.kwaliteit_waarnemingen(id) on delete cascade,
  url           text not null,
  soort         text not null default 'detail'
                  check (soort in ('overzicht','detail','afwijking','meetbewijs','positief','herstel')),
  omschrijving  text,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  constraint kwaliteit_fotos_een_koppeling check (
    (inspectie_id  is not null)::int +
    (resultaat_id  is not null)::int +
    (afwijking_id  is not null)::int +
    (waarneming_id is not null)::int = 1
  )
);

comment on table public.kwaliteit_fotos is
  'Foto bij een inspectie, resultaat, afwijking of positieve waarneming. Precies een koppeling per rij.';

create index if not exists idx_kwaliteit_fotos_inspectie  on public.kwaliteit_fotos (inspectie_id)  where inspectie_id  is not null;
create index if not exists idx_kwaliteit_fotos_resultaat  on public.kwaliteit_fotos (resultaat_id)  where resultaat_id  is not null;
create index if not exists idx_kwaliteit_fotos_afwijking  on public.kwaliteit_fotos (afwijking_id)  where afwijking_id  is not null;
create index if not exists idx_kwaliteit_fotos_waarneming on public.kwaliteit_fotos (waarneming_id) where waarneming_id is not null;

-- ── 12. Actie start een kwaliteitsronde ──────────────────────────────────────
-- Een vlag op de bestaande takentabel, precies zoals tasks.formulier_template_id. Bewust GEEN
-- tweede takenmodel: form_taken is in 20260820d juist opgeruimd omdat het naast tasks liep.
alter table public.tasks
  add column if not exists kwaliteit_ronde boolean not null default false;

comment on column public.tasks.kwaliteit_ronde is
  'true = deze actie start een kwaliteitsronde; de taak toont dan de knop Kwaliteitsronde starten en gaat op gereed zodra de inspectie definitief is.';

-- ── 13. RLS ──────────────────────────────────────────────────────────────────
do $rls$
declare
  t text;
  tabellen text[] := array[
    'kwaliteit_disciplines','kwaliteit_controlepunten','kwaliteit_inspecties',
    'kwaliteit_resultaten','kwaliteit_waarnemingen','kwaliteit_afwijkingen',
    'kwaliteit_afwijking_historie','kwaliteit_project_eisen',
    'kwaliteit_referentievlakken','kwaliteit_fotos'
  ];
begin
  foreach t in array tabellen loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists platform_gebruikers_all on public.%I', t);
    execute format(
      'create policy platform_gebruikers_all on public.%I for all to authenticated using (is_platform_gebruiker()) with check (is_platform_gebruiker())',
      t
    );
  end loop;
end $rls$;

-- ── 14. Fotobucket ───────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kwaliteit-fotos', 'kwaliteit-fotos', true, 26214400,
  array['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do nothing;

do $buckets$ begin
  if not exists (select 1 from pg_policies where policyname = 'Kwaliteit-fotos lezen' and tablename = 'objects') then
    create policy "Kwaliteit-fotos lezen"
      on storage.objects for select to authenticated
      using (bucket_id = 'kwaliteit-fotos' and is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Kwaliteit-fotos uploaden' and tablename = 'objects') then
    create policy "Kwaliteit-fotos uploaden"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'kwaliteit-fotos' and is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Kwaliteit-fotos verwijderen' and tablename = 'objects') then
    create policy "Kwaliteit-fotos verwijderen"
      on storage.objects for delete to authenticated
      using (bucket_id = 'kwaliteit-fotos' and is_platform_gebruiker());
  end if;
end $buckets$;

notify pgrst, 'reload schema';
