-- Opname (mutatiewerk) — vervanging van Bouwportaal.
--
-- Een opnemer loopt ter plaatse een woning door en vinkt per ruimte onderdelen aan uit een met de
-- opdrachtgever afgesproken lijst, met foto's erbij. De calculator drukt daarna één knop en heeft
-- een calculatie waar hij een nette offerte van maakt.
--
-- ONTWERPKEUZES
--
-- 1. Eigen tabellen, geen uitbreiding van paint_items. Die tabel is bedrijfsbreed en rijen met
--    vergrendeld = true worden door een trigger overschreven vanuit de Schilderwerkbibliotheek.
--    Een corporatie-prijslijst erin duwen vervuilt de receptenkiezer van élke calculatie. En
--    relatie_verkoop_prijsafspraken is een platte lijst zonder code, groepen, recept of fotoplicht;
--    die uitbreiden levert de facto deze tabellen op onder een misleidende naam.
--
-- 2. Prijs en kostprijs zijn twee ONAFHANKELIJKE assen op één onderdeel:
--      prijs_soort   ('vast' | 'recept')  bepaalt hoe de VERKOOPPRIJS ontstaat;
--      paint_item_id (nullable)           bepaalt waar de KOSTPRIJS vandaan komt.
--    Zo dekt één rij alle drie de praktijkgevallen: puur recept, afgesproken prijs mét recept als
--    kostenonderbouwing, en afgesproken prijs zonder enige onderbouwing.
--
-- 3. opname_regels draagt een SNAPSHOT van de prijsafspraak, inclusief normen (jsonb). Een
--    prijswijziging in de bibliotheek mag een lopende opname nooit met terugwerkende kracht
--    veranderen. Zelfde gedachte als kwaliteit_resultaten.toegepaste_eis en het bevroren
--    form_versies.schema. Dit is óók de enige bescherming tegen de spiegel-trigger op paint_items.
--
-- 4. Ruimtes zijn een PLATTE lijst per prijslijst, geen boom. Mutatiewerk is één woning, één
--    niveau (keuken, badkamer, hal, slaapkamer 1-3). De 3-niveau boom van houtrot_dossier_config
--    wordt per dossier ingericht en past hier niet: deze ruimtes zijn per opdrachtgever standaard.
--
-- 5. opname_regels.id wordt CLIENT-GENEREERD en is straks óók de Calculatieregel.id. Dat is de kern
--    van twee dingen tegelijk: de import naar de calculatie is idempotent (slaCalculatieregelOp
--    upsert op id), en het nasturen vanuit de offline-wachtrij is dat ook (upsert on conflict).
--
-- Deze migratie is puur ADDITIEF; de enige wijziging aan bestaand werk is een booleaanse kolom op
-- public.tasks plus een rij in dossier_toggle_definities.

-- ── Gedeelde updated_at-trigger voor deze module ─────────────────────────────
-- `set search_path = public`: zonder dat is het zoekpad rol-afhankelijk en kan een schema eerder in
-- het pad een tabel- of functienaam kapen.
create or replace function public.opname_touch_updated_at()
returns trigger language plpgsql
set search_path = public
as $fn$
begin
  new.updated_at := now();
  return new;
end $fn$;

-- ── 1. Prijslijst per opdrachtgever ──────────────────────────────────────────
-- Corporaties leveren jaarlijks een nieuwe lijst. Kopiëren naar een nieuwe jaargang, activeren, de
-- oude op 'vervallen'. Lopende opnames houden hun eigen snapshot en veranderen dus niet mee.
create table if not exists public.opname_prijslijsten (
  id                   uuid primary key default gen_random_uuid(),
  relatie_id           uuid not null references public.relaties(id) on delete cascade,
  naam                 text not null,
  jaargang             text,
  geldig_vanaf         date,
  geldig_tot           date,
  status               text not null default 'concept' check (status in ('concept','actief','vervallen')),
  standaard_opslag_pct numeric(6,3) not null default 0,
  uurtarief_kostprijs  numeric(10,2),
  btw_tarief_id        uuid references public.btw_tarieven(id) on delete set null,
  bron_bestand         text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid
);

comment on table public.opname_prijslijsten is
  'Een met een opdrachtgever afgesproken lijst mutatie-onderdelen, per jaargang. Alleen een lijst met status actief is bij een nieuwe opname te kiezen.';
comment on column public.opname_prijslijsten.standaard_opslag_pct is
  'Wordt gebruikt om een kostprijs AF TE LEIDEN bij onderdelen met een vaste prijs zonder eigen kostprijs of recept: kostprijs = verkoop / (1 + pct/100). Op 0 laten betekent kostprijs = verkoopprijs, dus marge 0.';
comment on column public.opname_prijslijsten.uurtarief_kostprijs is
  'Kostprijs-uurtarief om de uren van een vaste-prijs-onderdeel als echte arbeidscomponent in de calculatie te zetten, zodat werkbegroting en planning kloppende uren krijgen.';

create index if not exists idx_opname_prijslijsten_relatie
  on public.opname_prijslijsten (relatie_id, status);

drop trigger if exists trg_opname_prijslijsten_updated on public.opname_prijslijsten;
create trigger trg_opname_prijslijsten_updated
  before update on public.opname_prijslijsten
  for each row execute function public.opname_touch_updated_at();

-- ── 2. Onderdelen (de bibliotheek) ───────────────────────────────────────────
create table if not exists public.opname_onderdelen (
  id                    uuid primary key default gen_random_uuid(),
  prijslijst_id         uuid not null references public.opname_prijslijsten(id) on delete cascade,
  code                  text not null,
  hoofdgroep            text,
  subgroep              text,
  omschrijving          text not null,
  toelichting           text,
  eenheid               text not null default 'st',
  prijs_soort           text not null check (prijs_soort in ('vast','recept')),
  verkoop_pe            numeric(12,4),
  kostprijs_pe          numeric(12,4),
  uren_pe               numeric(10,3),
  paint_item_id         uuid references public.paint_items(id) on delete set null,
  opslag_pct            numeric(6,3),
  btw_tarief_id         uuid references public.btw_tarieven(id) on delete set null,
  btw_pct               numeric(5,2),
  kostengroep           text,
  foto_verplicht        boolean not null default false,
  toelichting_verplicht boolean not null default false,
  standaard_aantal      numeric(12,3) not null default 1,
  aantal_stap           numeric(12,3) not null default 1,
  volgorde              integer not null default 0,
  actief                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint opname_onderdelen_code_uniek unique (prijslijst_id, code),
  constraint opname_onderdelen_vast_heeft_prijs
    check (prijs_soort <> 'vast' or verkoop_pe is not null),
  constraint opname_onderdelen_recept_heeft_item
    check (prijs_soort <> 'recept' or paint_item_id is not null)
);

comment on column public.opname_onderdelen.prijs_soort is
  'vast = de met de opdrachtgever afgesproken eenheidsprijs is leidend (verkoop_pe). recept = de prijs volgt uit de normen van het gekoppelde paint_item plus opslag.';
comment on column public.opname_onderdelen.paint_item_id is
  'Optionele kostenonderbouwing uit de gedeelde receptenbibliotheek. Ook bij prijs_soort = vast zinvol: dan levert het recept de kostprijs en de uren, terwijl verkoop_pe de prijs bepaalt.';
comment on column public.opname_onderdelen.kostengroep is
  'Wordt overgenomen op de calculatieregel en voedt daarmee de werkbegroting.';

create index if not exists idx_opname_onderdelen_lijst
  on public.opname_onderdelen (prijslijst_id, hoofdgroep, volgorde) where actief;

drop trigger if exists trg_opname_onderdelen_updated on public.opname_onderdelen;
create trigger trg_opname_onderdelen_updated
  before update on public.opname_onderdelen
  for each row execute function public.opname_touch_updated_at();

-- ── 3. Ruimte-sjabloon ───────────────────────────────────────────────────────
create table if not exists public.opname_ruimtes (
  id            uuid primary key default gen_random_uuid(),
  prijslijst_id uuid not null references public.opname_prijslijsten(id) on delete cascade,
  naam          text not null,
  volgorde      integer not null default 0,
  actief        boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint opname_ruimtes_naam_uniek unique (prijslijst_id, naam)
);

comment on table public.opname_ruimtes is
  'Voorgestelde ruimtes bij een prijslijst. Een opnemer mag altijd een eigen ruimtenaam typen; die landt als vrije tekst op de regel.';

-- ── 4. Nummering ─────────────────────────────────────────────────────────────
create sequence if not exists public.opname_volgnummer;

create or replace function public.volgend_opnamenummer()
returns text language sql volatile
set search_path = public
as $fn$
  select 'OPN-' || to_char(now(),'YYYY') || '-'
    || lpad(nextval('public.opname_volgnummer')::text, 3, '0');
$fn$;

-- ── 5. Opnames ───────────────────────────────────────────────────────────────
create table if not exists public.opnames (
  id                     uuid primary key default gen_random_uuid(),
  opnamenummer           text not null unique default public.volgend_opnamenummer(),
  dossier_id             uuid not null references public.dossiers(id) on delete cascade,
  prijslijst_id          uuid not null references public.opname_prijslijsten(id) on delete restrict,
  relatie_id             uuid references public.relaties(id) on delete set null,
  task_id                uuid references public.tasks(id) on delete set null,
  opnemer_id             uuid references public.medewerkers(id) on delete set null,
  datum                  date not null default current_date,
  adres_vrij             text,
  vhe_aanduiding         text,
  soort                  text not null default 'mutatie' check (soort in ('mutatie','vooropname','naopname')),
  status                 text not null default 'concept' check (status in ('concept','gereed','omgezet','geannuleerd')),
  gereed_op              timestamptz,
  gereed_door            uuid references public.medewerkers(id) on delete set null,
  calculatie_project_id  uuid,
  calculatie_scenario_id uuid,
  calculatie_groep_id    uuid,
  omgezet_op             timestamptz,
  omgezet_door           uuid references public.medewerkers(id) on delete set null,
  opmerking              text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid
);

comment on table public.opnames is
  'Een opname ter plaatse, altijd hangend aan een dossier. Zolang de status concept is, is het het werkdocument van de opnemer.';
comment on column public.opnames.prijslijst_id is
  'on delete restrict: een prijslijst waar opnames aan hangen mag niet verdwijnen. Uit gebruik nemen gaat via status = vervallen.';
comment on column public.opnames.calculatie_groep_id is
  'De bovengroep in de calculatie waar deze opname in landt. Bij een herimport wordt dezelfde groep hergebruikt, zodat er nooit een tweede blok ontstaat.';
comment on column public.opnames.vhe_aanduiding is
  'Verhuureenheid- of complexnummer van de opdrachtgever, zoals dat op hun opdracht staat.';

create index if not exists idx_opnames_dossier on public.opnames (dossier_id, datum desc);
create index if not exists idx_opnames_task on public.opnames (task_id) where task_id is not null;

drop trigger if exists trg_opnames_updated on public.opnames;
create trigger trg_opnames_updated
  before update on public.opnames
  for each row execute function public.opname_touch_updated_at();

-- ── 6. Opnameregels ──────────────────────────────────────────────────────────
create table if not exists public.opname_regels (
  id                     uuid primary key,
  opname_id              uuid not null references public.opnames(id) on delete cascade,
  onderdeel_id           uuid references public.opname_onderdelen(id) on delete set null,
  ruimte                 text,
  ruimte_id              uuid references public.opname_ruimtes(id) on delete set null,
  volgorde               integer not null default 0,
  aantal                 numeric(12,3) not null default 1,
  toelichting_opnemer    text,
  -- snapshot van de prijsafspraak, bevroren op het moment van toevoegen
  onderdeel_code         text,
  omschrijving           text not null,
  eenheid                text not null default 'st',
  prijs_soort            text not null default 'vast' check (prijs_soort in ('vast','recept')),
  verkoop_pe             numeric(12,4),
  kostprijs_pe           numeric(12,4),
  uren_pe                numeric(10,3),
  opslag_pct             numeric(6,3),
  btw_tarief_id          uuid references public.btw_tarieven(id) on delete set null,
  btw_pct                numeric(5,2),
  kostengroep            text,
  normen                 jsonb not null default '[]'::jsonb,
  regel_verkoop_totaal   numeric(14,2) generated always as (round(aantal * coalesce(verkoop_pe, 0), 2)) stored,
  regel_kostprijs_totaal numeric(14,2) generated always as (round(aantal * coalesce(kostprijs_pe, 0), 2)) stored,
  client_bijgewerkt_op   timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid
);

comment on column public.opname_regels.id is
  'Geen default: de client genereert dit id voordat de regel de deur uit gaat. Datzelfde id wordt straks de Calculatieregel.id, waardoor zowel het nasturen vanuit de offline-wachtrij als de import naar de calculatie idempotent is.';
comment on column public.opname_regels.normen is
  'Bevroren componentregels: [{type: arbeid|materieel|onderaanneming, norm_hoeveelheid, eenheid, tarief, omschrijving}]. Wordt bij het toevoegen uit het recept gekopieerd, zodat een latere prijswijziging in de bibliotheek deze opname niet raakt.';
comment on column public.opname_regels.client_bijgewerkt_op is
  'Tijdstempel van de client, bepaalt last-write-wins wanneer een offline gebufferde wijziging later alsnog binnenkomt.';
comment on column public.opname_regels.regel_verkoop_totaal is
  'GENERATED — nooit zelf schrijven.';

create index if not exists idx_opname_regels_opname on public.opname_regels (opname_id, volgorde);
create index if not exists idx_opname_regels_onderdeel on public.opname_regels (onderdeel_id) where onderdeel_id is not null;

drop trigger if exists trg_opname_regels_updated on public.opname_regels;
create trigger trg_opname_regels_updated
  before update on public.opname_regels
  for each row execute function public.opname_touch_updated_at();

-- ── 7. Foto's ────────────────────────────────────────────────────────────────
-- opname_id is altijd gevuld, ook bij een regelfoto: "alle foto's van deze opname" is daarmee één
-- query zonder join, en het opruimen bij het verwijderen van de opname loopt langs één cascade.
create table if not exists public.opname_fotos (
  id           uuid primary key default gen_random_uuid(),
  opname_id    uuid not null references public.opnames(id) on delete cascade,
  regel_id     uuid references public.opname_regels(id) on delete cascade,
  pad          text not null,
  url          text not null,
  soort        text not null default 'detail' check (soort in ('overzicht','detail','schade','meterstand')),
  omschrijving text,
  volgorde     integer not null default 0,
  is_hoofdfoto boolean not null default false,
  created_at   timestamptz not null default now(),
  created_by   uuid
);

comment on column public.opname_fotos.regel_id is
  'Leeg = algemene foto bij de opname (vooraanzicht, meterstand). Gevuld = foto bij die begrotingsregel; die gaat mee naar de calculatieregel en zo naar de offerte.';
comment on column public.opname_fotos.is_hoofdfoto is
  'De foto die bij de import naar de calculatie wordt meegenomen. Alle andere blijven hier en in het opnamerapport.';

create index if not exists idx_opname_fotos_opname on public.opname_fotos (opname_id, volgorde);
create index if not exists idx_opname_fotos_regel on public.opname_fotos (regel_id) where regel_id is not null;

-- ── 8. Actie die een opname start ────────────────────────────────────────────
alter table public.tasks
  add column if not exists opname_ronde boolean not null default false;

comment on column public.tasks.opname_ronde is
  'true = deze actie start een opname; de taak toont dan de knop Opname starten en gaat op gereed zodra de opname gereed is.';

-- ── 9. Dossier-toggle ────────────────────────────────────────────────────────
-- Zonder deze rij verschijnt de tab nergens en lijkt de hele module stuk.
insert into public.dossier_toggle_definities (sleutel, label, volgorde, actief)
values ('mutatie_opname', 'Mutatie-opname', 0, true)
on conflict (sleutel) do nothing;

-- ── 10. RLS ──────────────────────────────────────────────────────────────────
-- App-gebruikers (monteurs, opnemers) vallen hier bewust buiten: /m draait op de admin-client en
-- schermt per pagina zelf af. Zie de guard in app/m/opname/[opnameId]/page.tsx.
do $rls$
declare
  t text;
  tabellen text[] := array[
    'opname_prijslijsten','opname_onderdelen','opname_ruimtes',
    'opnames','opname_regels','opname_fotos'
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

-- ── 11. Fotobucket ───────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'opname-fotos', 'opname-fotos', true, 26214400,
  array['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do nothing;

do $buckets$ begin
  if not exists (select 1 from pg_policies where policyname = 'Opname-fotos lezen' and tablename = 'objects') then
    create policy "Opname-fotos lezen"
      on storage.objects for select to authenticated
      using (bucket_id = 'opname-fotos' and is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Opname-fotos uploaden' and tablename = 'objects') then
    create policy "Opname-fotos uploaden"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'opname-fotos' and is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Opname-fotos verwijderen' and tablename = 'objects') then
    create policy "Opname-fotos verwijderen"
      on storage.objects for delete to authenticated
      using (bucket_id = 'opname-fotos' and is_platform_gebruiker());
  end if;
end $buckets$;

notify pgrst, 'reload schema';
