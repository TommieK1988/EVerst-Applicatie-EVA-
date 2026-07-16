-- Materieelbeheer — centrale materieeldatabase (digitaal paspoort per object)
--
-- Nieuwe, op zichzelf staande module voor gereedschap, machines, aanhangers,
-- keten, steigermateriaal, meetapparatuur en PBM. Doel: minder zoekgeraakt
-- gereedschap, minder onnodige aankopen, aantoonbaar veilig materieel en
-- minimale administratieve last.
--
-- Deze migratie is puur ADDITIEF: alleen nieuwe tabellen/enums. Bestaande
-- functionaliteit wordt niet geraakt. De module zelf zit in de app achter een
-- env-flag (NEXT_PUBLIC_FEATURE_MATERIEEL) en is daardoor in productie afwezig
-- tot hij bewust wordt aangezet.
--
-- Kernontwerp:
--  * materieel_objecten  = het paspoort (huidige status + huidige toewijzing inline)
--  * satelliet-tabellen  = historie/traceerbaarheid (toewijzingen, controles,
--    onderhoud, keuringen, scans, documenten)
--  * categorie-specifieke velden (aanhanger/keet/accu) leven in `details` (jsonb),
--    behalve datumgebonden keuringen/APK — die staan als losse rijen in
--    materieel_keuringen zodat "verloopt binnen 30 dagen" één query is.
--  * "persoonlijke" toewijzing hangt aan de bestaande medewerkers-tabel; "team"
--    (servicebus, keet) aan de nieuwe materieel_teams-tabel.
--
-- RLS: net als de rest van het platform staat RLS aan met een
-- is_platform_gebruiker()-policy; de app leest/muteert via de service-role client
-- en dwingt autorisatie in de server-actions af.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'materieel_categorie') then
    create type materieel_categorie as enum (
      'gereedschap','machine','aanhanger','keet','steigeronderdeel','meetapparatuur','pbm'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'materieel_status') then
    create type materieel_status as enum (
      'in_gebruik','beschikbaar','gereserveerd','onderhoud','defect','vermist'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'materieel_toewijzing_niveau') then
    create type materieel_toewijzing_niveau as enum ('persoonlijk','team','algemeen');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'materieel_team_type') then
    create type materieel_team_type as enum ('bus','keet','ploeg','algemeen');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'materieel_document_type') then
    create type materieel_document_type as enum ('foto','handleiding','ce','keuring','factuur','overig');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Gedeelde updated_at-trigger voor de materieel-tabellen
-- ---------------------------------------------------------------------------
create or replace function public.materieel_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- materieel_teams — "team"-toewijzing (servicebus, keet, ploeg)
-- ---------------------------------------------------------------------------
create table if not exists public.materieel_teams (
  id           uuid primary key default gen_random_uuid(),
  naam         text not null,
  type         materieel_team_type not null default 'algemeen',
  omschrijving text,
  kenteken     text,               -- voor servicebussen
  actief       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_materieel_teams_touch on public.materieel_teams;
create trigger trg_materieel_teams_touch before update on public.materieel_teams
  for each row execute function public.materieel_touch_updated_at();

-- ---------------------------------------------------------------------------
-- materieel_objecten — het digitale paspoort
-- ---------------------------------------------------------------------------
create table if not exists public.materieel_objecten (
  id                       uuid primary key default gen_random_uuid(),
  inventarisnummer         text unique,
  qr_code                  text unique,          -- stabiele QR-/NFC-identifier (default = id)
  omschrijving             text not null,
  categorie                materieel_categorie not null,
  merk                     text,
  type                     text,
  serienummer              text,
  aankoopdatum             date,
  leverancier              text,
  garantie_tot             date,
  aanschafwaarde           numeric(12,2),
  boekwaarde               numeric(12,2),
  status                   materieel_status not null default 'beschikbaar',

  -- Huidige toewijzing (historie staat in materieel_toewijzingen)
  toewijzing_niveau        materieel_toewijzing_niveau,
  toegewezen_medewerker_id uuid references public.medewerkers(id) on delete set null,
  toegewezen_team_id       uuid references public.materieel_teams(id) on delete set null,

  -- Categorie-specifieke velden (aanhanger: banden/slot; keet: sleutels/ehbo; accu: laadcycli/leeftijd)
  details                  jsonb not null default '{}'::jsonb,

  -- Koppeling accu → machine, of onderdeel → hoofdobject
  hoort_bij_object_id      uuid references public.materieel_objecten(id) on delete set null,

  hoofdfoto_url            text,
  opmerkingen              text,

  -- Laatste scan (voor vermissing snel terugvinden; volledige log in materieel_scans)
  laatst_gescand_at        timestamptz,
  laatst_gescand_door      uuid references public.medewerkers(id) on delete set null,

  actief                   boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid references public.medewerkers(id) on delete set null
);

-- QR-code standaard gelijk aan de id (stabiele URL /materieelbeheer/<id>)
create or replace function public.materieel_default_qr()
returns trigger language plpgsql as $$
begin
  if new.qr_code is null then
    new.qr_code := new.id::text;
  end if;
  return new;
end $$;

drop trigger if exists trg_materieel_objecten_qr on public.materieel_objecten;
create trigger trg_materieel_objecten_qr before insert on public.materieel_objecten
  for each row execute function public.materieel_default_qr();

drop trigger if exists trg_materieel_objecten_touch on public.materieel_objecten;
create trigger trg_materieel_objecten_touch before update on public.materieel_objecten
  for each row execute function public.materieel_touch_updated_at();

create index if not exists idx_materieel_objecten_categorie on public.materieel_objecten (categorie);
create index if not exists idx_materieel_objecten_status    on public.materieel_objecten (status);
create index if not exists idx_materieel_objecten_medewerker on public.materieel_objecten (toegewezen_medewerker_id);
create index if not exists idx_materieel_objecten_team      on public.materieel_objecten (toegewezen_team_id);

-- ---------------------------------------------------------------------------
-- materieel_documenten — foto's, handleiding, CE, keuringsdocumenten, factuur
-- ---------------------------------------------------------------------------
create table if not exists public.materieel_documenten (
  id            uuid primary key default gen_random_uuid(),
  object_id     uuid not null references public.materieel_objecten(id) on delete cascade,
  type          materieel_document_type not null default 'overig',
  bestandsnaam  text,
  url           text not null,
  geupload_at   timestamptz not null default now(),
  geupload_door uuid references public.medewerkers(id) on delete set null
);
create index if not exists idx_materieel_documenten_object on public.materieel_documenten (object_id);

-- ---------------------------------------------------------------------------
-- materieel_toewijzingen — uitgifte-historie (wie had wat, wanneer)
-- ---------------------------------------------------------------------------
create table if not exists public.materieel_toewijzingen (
  id            uuid primary key default gen_random_uuid(),
  object_id     uuid not null references public.materieel_objecten(id) on delete cascade,
  niveau        materieel_toewijzing_niveau not null,
  medewerker_id uuid references public.medewerkers(id) on delete set null,
  team_id       uuid references public.materieel_teams(id) on delete set null,
  van           timestamptz not null default now(),
  tot           timestamptz,                       -- null = nog actief
  door          uuid references public.medewerkers(id) on delete set null,
  opmerking     text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_materieel_toewijzingen_object on public.materieel_toewijzingen (object_id);
create index if not exists idx_materieel_toewijzingen_actief on public.materieel_toewijzingen (object_id) where tot is null;

-- ---------------------------------------------------------------------------
-- materieel_controles — periodieke controle (aanwezig / werkt / beschadigd / vermist)
-- ---------------------------------------------------------------------------
create table if not exists public.materieel_controles (
  id             uuid primary key default gen_random_uuid(),
  object_id      uuid not null references public.materieel_objecten(id) on delete cascade,
  controle_datum date not null default current_date,
  uitgevoerd_door uuid references public.medewerkers(id) on delete set null,
  aanwezig       boolean,
  werkt_goed     boolean,
  status         text,               -- 'ok' | 'beschadigd' | 'vermist'
  opmerking      text,
  foto_url       text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_materieel_controles_object on public.materieel_controles (object_id);
create index if not exists idx_materieel_controles_datum  on public.materieel_controles (controle_datum);

-- ---------------------------------------------------------------------------
-- materieel_onderhoud — storingen, reparaties, onderhoud (kosten + top-10 analyse)
-- ---------------------------------------------------------------------------
create table if not exists public.materieel_onderhoud (
  id            uuid primary key default gen_random_uuid(),
  object_id     uuid not null references public.materieel_objecten(id) on delete cascade,
  type          text not null default 'onderhoud',   -- 'storing' | 'reparatie' | 'onderhoud'
  omschrijving  text,
  datum         date not null default current_date,
  kosten        numeric(12,2),
  uitgevoerd_door text,
  status        text not null default 'open',         -- 'open' | 'afgerond'
  gemeld_door   uuid references public.medewerkers(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_materieel_onderhoud_object on public.materieel_onderhoud (object_id);

-- ---------------------------------------------------------------------------
-- materieel_keuringen — APK, CE, elektra-/veiligheidskeuring (datumbewaking)
-- ---------------------------------------------------------------------------
create table if not exists public.materieel_keuringen (
  id           uuid primary key default gen_random_uuid(),
  object_id    uuid not null references public.materieel_objecten(id) on delete cascade,
  soort        text not null,                 -- 'apk' | 'ce' | 'elektra' | 'veiligheid' | 'overig'
  geldig_van   date,
  geldig_tot   date,
  document_url text,
  opmerking    text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_materieel_keuringen_object on public.materieel_keuringen (object_id);
create index if not exists idx_materieel_keuringen_tot    on public.materieel_keuringen (geldig_tot);

-- ---------------------------------------------------------------------------
-- materieel_scans — scan-log (laatste gebruiker/project → vermissing terugvinden)
-- ---------------------------------------------------------------------------
create table if not exists public.materieel_scans (
  id           uuid primary key default gen_random_uuid(),
  object_id    uuid not null references public.materieel_objecten(id) on delete cascade,
  gescand_door uuid references public.medewerkers(id) on delete set null,
  gescand_at   timestamptz not null default now(),
  locatie      text,
  context      text
);
create index if not exists idx_materieel_scans_object on public.materieel_scans (object_id);

-- ---------------------------------------------------------------------------
-- RLS — platform-gebruiker-policy (net als de rest van het platform)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tabellen text[] := array[
    'materieel_teams','materieel_objecten','materieel_documenten',
    'materieel_toewijzingen','materieel_controles','materieel_onderhoud',
    'materieel_keuringen','materieel_scans'
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
end $$;
