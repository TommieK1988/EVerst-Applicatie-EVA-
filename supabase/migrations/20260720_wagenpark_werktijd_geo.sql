-- =====================================================================
-- Wagenpark — werktijd-analyse: coördinaten, geocode-cache, maandrapport
-- =====================================================================
-- Voor de dagelijkse aanwezigheids-signalen en de maandelijkse werktijd-
-- analyse bepalen we of een rit start/eindigt binnen een straal rond het
-- WERK- of WOONadres. Daarvoor zijn coördinaten nodig; die staan vandaag
-- nergens (adressen zijn vrije tekst). We voegen lat/lng toe op de
-- referentie-adressen (bedrijf + medewerker) en op de ritten, plus een
-- geocode-cache zodat we hetzelfde adres nooit twee keer opvragen.
-- Additieve migratie — geen bestaande kolommen gewijzigd of verwijderd.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Referentie-adressen: coördinaten van werk- en woonadres
-- ---------------------------------------------------------------------
alter table public.bedrijfsgegevens
  add column if not exists adres_lat      double precision,
  add column if not exists adres_lng      double precision,
  add column if not exists geocode_status text,
  add column if not exists geocode_op     timestamptz;

alter table public.medewerkers
  add column if not exists adres_lat      double precision,
  add column if not exists adres_lng      double precision,
  add column if not exists geocode_status text,
  add column if not exists geocode_op     timestamptz;

-- ---------------------------------------------------------------------
-- 2. Rit-coördinaten (self-warming: door de analyse gevuld via geocoding,
--    of in de toekomst rechtstreeks uit de ULU-payload als die coords levert)
-- ---------------------------------------------------------------------
alter table public.ulu_trips
  add column if not exists start_lat double precision,
  add column if not exists start_lng double precision,
  add column if not exists stop_lat  double precision,
  add column if not exists stop_lng  double precision;

-- ---------------------------------------------------------------------
-- 3. Geocode-cache — voorkomt herhaalde externe geocode-calls
-- ---------------------------------------------------------------------
create table if not exists public.geocode_cache (
  query        text primary key,
  lat          double precision,
  lng          double precision,
  bron         text,
  aangemaakt_op timestamptz not null default now()
);
alter table public.geocode_cache enable row level security;
-- Geen policies: PostgREST (anon/authenticated) krijgt niets; de directe
-- Postgres-pooler (wagenpark-module) draait buiten RLS en blijft werken.

-- ---------------------------------------------------------------------
-- 4. Config voor de werktijd-analyse (straal + marges), bewerkbaar via
--    de bestaande instellingen-editor (handboek_regels → drempel_config)
-- ---------------------------------------------------------------------
insert into public.handboek_regels (code, titel, beschrijving, actief, drempel_config)
values
  ('R11', 'Werktijd-analyse (aanwezigheid)',
          'Bepaalt aankomst op / vertrek van de werkplek uit de ritten, binnen een straal '
          || 'rond werk- en woonadres. Roostertijden (dagstart/dageind) gelden als grens. '
          || 'Config: straal_meter, marge_aankomst_min, marge_vertrek_min.',
          true,
          '{"straal_meter":500,"thuis_straal_meter":500,"marge_aankomst_min":0,"marge_vertrek_min":0}'::jsonb)
on conflict (code) do update set
  titel        = excluded.titel,
  beschrijving = excluded.beschrijving,
  -- Bestaande config-waarden behouden, alleen ontbrekende sleutels aanvullen.
  drempel_config = excluded.drempel_config || public.handboek_regels.drempel_config,
  gewijzigd_op = now();

-- ---------------------------------------------------------------------
-- 5. Maandrapport-opslag (één rij per bestuurder per maand)
-- ---------------------------------------------------------------------
create table if not exists public.wagenpark_werktijd_maandrapport (
  id            uuid primary key default gen_random_uuid(),
  user_id_ulu   bigint not null references public.ulu_users(id) on delete cascade,
  jaar          smallint not null,
  maand         smallint not null,
  samenvatting  jsonb not null,
  aangemaakt_op timestamptz not null default now(),
  constraint wagenpark_werktijd_maandrapport_maand check (maand between 1 and 12),
  constraint wagenpark_werktijd_maandrapport_uniek unique (user_id_ulu, jaar, maand)
);
create index if not exists wagenpark_werktijd_maandrapport_periode_idx
  on public.wagenpark_werktijd_maandrapport (jaar, maand);
alter table public.wagenpark_werktijd_maandrapport enable row level security;
-- Geen policies: alleen bereikbaar via de directe pooler in Directie-gated code.
