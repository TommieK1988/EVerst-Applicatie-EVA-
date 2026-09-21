-- PDF-bijlages bij een calculatie, die meegaan in de offerte-PDF.
--
-- Een offerte-PDF bestond uit de gerenderde offerte plus de algemene voorwaarden erachter.
-- Alles wat een calculator daarnaast wil meesturen — een productblad, een kwaliteitsverklaring,
-- een detailtekening — moest handmatig naast de offerte gemaild worden, buiten EVA om. Deze
-- twee tabellen maken daar een vaste plek voor: de bijlages komen in de PDF ná de offerte en
-- vóór de algemene voorwaarden.
--
-- WAAROM TWEE TABELLEN
--
-- `calculatie_bijlagen` hangt aan de calculatie (het scenario) en is wat de gebruiker beheert.
-- `quote_bijlagen` is de bevroren kopie op de offerte, precies zoals `quote_terms` dat is voor de
-- vrije teksten. Een offerte moet blijven tonen wat er destijds is verstuurd, ook als iemand de
-- calculatie daarna aanpast of een bijlage weggooit. Het bevriezen is een echte `storage.copy`
-- naar een eigen pad onder `offerte/{quoteId}/`, zodat het verwijderen van een calculatie-bijlage
-- nooit een verzonden offerte uitholt.
--
-- WAAROM NIET IN DE SCENARIO-JSONB
--
-- De vrije offerte-teksten staan wél in het scenario (`calculatie_snapshots.data`), maar dat is
-- een blob die de client als geheel terugschrijft. Een upload is een serverhandeling: bestand en
-- rij horen atomair bij elkaar. Zou de metadata in die blob staan, dan wist een tweede open
-- tabblad dat een seconde later autosavet de bijlage die je net uploadde — en voor een bevroren
-- scenario geeft `beschermBevrorenScenarios` sowieso altijd de serverversie terug.

-- ─── Bijlages bij de calculatie ──────────────────────────────────────────────────────────────

create table if not exists public.calculatie_bijlagen (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid   not null references public.projects(id) on delete cascade,
  scenario_id   uuid   not null,
  bestandsnaam  text   not null,
  -- Pad in de bucket `offerte-bijlagen`, onder calculatie/{projectId}/{scenarioId}/.
  pad           text   not null unique,
  bytes         bigint not null,
  -- Paginateller, bij upload uit pdf-lib. Puur voor het scherm ("3 pagina's").
  paginas       int,
  volgorde      int    not null default 0,
  created_at    timestamptz not null default now(),
  created_by    uuid
);

comment on table public.calculatie_bijlagen is
  'PDF-bijlages die een calculator aan een calculatie hangt. Worden bij het aanmaken van de offerte bevroren gekopieerd naar quote_bijlagen.';

-- Bewust géén foreign key: een scenario is een JSONB-object binnen
-- calculatie_snapshots.data, geen rij in een tabel. Opruimen gaat via project_id.
comment on column public.calculatie_bijlagen.scenario_id is
  'Scenario (calculatie) binnen het project. Geen FK — scenarios zijn JSONB-objecten in calculatie_snapshots, geen rijen.';

create index if not exists calculatie_bijlagen_scenario_idx
  on public.calculatie_bijlagen (project_id, scenario_id, volgorde);

-- ─── Bevroren bijlages bij de offerte ────────────────────────────────────────────────────────

create table if not exists public.quote_bijlagen (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid   not null references public.quotes(id) on delete cascade,
  bestandsnaam    text   not null,
  -- Eigen kopie onder offerte/{quoteId}/ — niet het pad van de calculatie-bijlage.
  pad             text   not null,
  bytes           bigint,
  volgorde        int    not null default 0,
  -- Herkomst, puur informatief. Geen FK: de calculatie-bijlage mag verdwijnen zonder
  -- dat dat iets zegt over wat er in deze offerte zit.
  bron_bijlage_id uuid,
  created_at      timestamptz not null default now()
);

comment on table public.quote_bijlagen is
  'Bevroren PDF-bijlages van een offerte, gekopieerd uit calculatie_bijlagen op het moment van aanmaken. Mirror van quote_terms.';

create index if not exists quote_bijlagen_quote_idx
  on public.quote_bijlagen (quote_id, volgorde);

-- ─── RLS ─────────────────────────────────────────────────────────────────────────────────────
--
-- De PDF-routes lezen met de sessie-client (`createClient()`), niet met de admin-client, dus
-- zonder select-policy blijven de bijlages leeg — precies het gat dat de contactpersoon-velden
-- eerder op de offerte liet ontbreken. Muteren gaat uitsluitend via server actions op de
-- service role. De subquery-vorm `(select is_platform_gebruiker())` is bewust: zo evalueert
-- Postgres de functie één keer per query in plaats van per rij (de initplan-valkuil).

alter table public.calculatie_bijlagen enable row level security;

drop policy if exists calculatie_bijlagen_select on public.calculatie_bijlagen;
create policy calculatie_bijlagen_select
  on public.calculatie_bijlagen for select to authenticated
  using ((select public.is_platform_gebruiker()));

alter table public.quote_bijlagen enable row level security;

drop policy if exists quote_bijlagen_select on public.quote_bijlagen;
create policy quote_bijlagen_select
  on public.quote_bijlagen for select to authenticated
  using ((select public.is_platform_gebruiker()));

-- ─── Bucket ──────────────────────────────────────────────────────────────────────────────────
--
-- Privé: een bijlage bij een offerte is klantdocumentatie en hoort niet op een raadbare
-- publieke URL, anders dan de algemene voorwaarden (die zijn openbaar en staan daarom wél in
-- een publieke bucket). De app komt erbij via de service-role; het scherm krijgt een
-- kortlopende signed URL.
--
-- 25 MB per bestand en uitsluitend application/pdf. De grens is er niet alleen tegen misbruik:
-- de PDF-samenvoeging houdt alles in geheugen, en de mail zet bijlages inline als base64.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('offerte-bijlagen', 'offerte-bijlagen', false, 26214400, array['application/pdf'])
on conflict (id) do nothing;

-- Deze policies staan er zodat een anon- of klantportaalsessie er niet zelf bij kan: een
-- portaalgebruiker is wel authenticated maar geen platformgebruiker. De service-role
-- bypasst ze.
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Offertebijlagen lezen' and tablename = 'objects') then
    create policy "Offertebijlagen lezen"
      on storage.objects for select to authenticated
      using (bucket_id = 'offerte-bijlagen' and is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Offertebijlagen uploaden' and tablename = 'objects') then
    create policy "Offertebijlagen uploaden"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'offerte-bijlagen' and is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Offertebijlagen verwijderen' and tablename = 'objects') then
    create policy "Offertebijlagen verwijderen"
      on storage.objects for delete to authenticated
      using (bucket_id = 'offerte-bijlagen' and is_platform_gebruiker());
  end if;
end $$;
