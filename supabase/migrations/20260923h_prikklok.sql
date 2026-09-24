-- Digitale prikklok — schaduwmodule (september 2026).
--
-- In- en uitklokken op de telefoon, alleen binnen de straal van het werkadres van een dossier.
-- Uit de sessies rekent EVA de uren per dossier per dag. In de fase 'schaduw' raakt niets hiervan
-- de echte urenstroom: uren_regels en Bouw7 blijven onaangeroerd. Alleen wie in tester_ids staat
-- ziet de module.
--
-- Puur additief: drie nieuwe tabellen, geen wijziging aan bestaande.

-- ── Instellingen (singleton) ───────────────────────────────────────────
create table if not exists public.prikklok_instellingen (
  id                     boolean primary key default true check (id),
  fase                   text not null default 'schaduw' check (fase in ('schaduw', 'live')),
  -- In de schaduwfase ziet alleen wie hierin staat de tegel en de schermen.
  tester_ids             uuid[] not null default '{}',
  straal_m               integer not null default 250 check (straal_m between 25 and 2000),
  -- Een fix die onnauwkeuriger is dan dit telt niet: bij 300 m onzekerheid zegt "binnen 250 m" niets.
  max_nauwkeurigheid_m   integer not null default 100 check (max_nauwkeurigheid_m between 5 and 1000),
  afronding_min          integer not null default 15 check (afronding_min in (1, 5, 6, 10, 15, 30)),
  pauze_min              integer not null default 30 check (pauze_min between 0 and 120),
  pauze_vanaf_min        integer not null default 330 check (pauze_vanaf_min between 0 and 1440),
  -- Herinnering "je bent nog ingeklokt": zoveel minuten na het roostereinde (of 17:00 zonder rooster).
  herinnering_na_min     integer not null default 30 check (herinnering_na_min between 0 and 600),
  updated_at             timestamptz not null default now()
);

insert into public.prikklok_instellingen (id, tester_ids)
select true, coalesce(array_agg(m.id), '{}')
from public.medewerkers m
join auth.users u on u.id = m.auth_user_id
where lower(u.email) = 'tom@everts.chat'
on conflict (id) do nothing;

-- ── Sessies: één rij per inklokmoment ──────────────────────────────────
create table if not exists public.prikklok_sessies (
  id                     uuid primary key default gen_random_uuid(),
  medewerker_id          uuid not null references public.medewerkers(id) on delete cascade,
  dossier_id             uuid not null references public.dossiers(id) on delete cascade,
  -- Nederlandse kalenderdag van het inklokken.
  datum                  date not null,

  in_op                  timestamptz not null default now(),
  in_lat                 double precision not null,
  in_lng                 double precision not null,
  in_nauwkeurigheid_m    double precision,
  in_afstand_m           double precision not null,

  uit_op                 timestamptz,
  uit_lat                double precision,
  uit_lng                double precision,
  uit_nauwkeurigheid_m   double precision,
  uit_afstand_m          double precision,
  -- locatie  = uitgeklokt binnen de straal
  -- wissel   = afgesloten doordat elders werd ingeklokt
  -- handmatig = "ik ben al vertrokken": vertrektijd zelf opgegeven, buiten de straal
  uit_wijze              text check (uit_wijze in ('locatie', 'wissel', 'handmatig')),

  uursoort_id            uuid references public.planning_uursoorten(id),
  bewakingscode          text,
  bouw7_psl_id           bigint,
  planning_item_id       uuid references public.planning_items(id) on delete set null,

  -- Testlocatie uit de schaduwfase: positie = coördinaten van het gekozen dossier.
  gesimuleerd            boolean not null default false,
  opmerking              text,
  herinnerd_op           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  check ((uit_op is null) = (uit_wijze is null)),
  check (uit_op is null or uit_op >= in_op)
);

-- Nooit twee keer tegelijk ingeklokt.
create unique index if not exists prikklok_sessies_een_open
  on public.prikklok_sessies (medewerker_id) where uit_op is null;
create index if not exists prikklok_sessies_mw_datum
  on public.prikklok_sessies (medewerker_id, datum);

-- ── Geweigerde pogingen ────────────────────────────────────────────────
-- Tijdens het testen het belangrijkste logboek: wáár en waarom het blokkeerde.
create table if not exists public.prikklok_pogingen (
  id                     uuid primary key default gen_random_uuid(),
  medewerker_id          uuid not null references public.medewerkers(id) on delete cascade,
  actie                  text not null check (actie in ('in', 'uit')),
  reden                  text not null check (reden in (
                           'te_ver', 'geen_coordinaten', 'slechte_nauwkeurigheid', 'geen_gps', 'geweigerd'
                         )),
  lat                    double precision,
  lng                    double precision,
  nauwkeurigheid_m       double precision,
  dichtstbij_dossier_id  uuid references public.dossiers(id) on delete set null,
  dichtstbij_afstand_m   double precision,
  gesimuleerd            boolean not null default false,
  created_at             timestamptz not null default now()
);
create index if not exists prikklok_pogingen_mw
  on public.prikklok_pogingen (medewerker_id, created_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────
-- Mobiel loopt via de admin-client met eigenaarscontrole in de code (zelfde patroon als de
-- weekstaat); hier alleen leesrecht voor platformgebruikers.
alter table public.prikklok_instellingen enable row level security;
alter table public.prikklok_sessies      enable row level security;
alter table public.prikklok_pogingen     enable row level security;

drop policy if exists prikklok_instellingen_lezen on public.prikklok_instellingen;
create policy prikklok_instellingen_lezen on public.prikklok_instellingen
  for select to authenticated using ((select public.is_platform_gebruiker()));

drop policy if exists prikklok_sessies_lezen on public.prikklok_sessies;
create policy prikklok_sessies_lezen on public.prikklok_sessies
  for select to authenticated using ((select public.is_platform_gebruiker()));

drop policy if exists prikklok_pogingen_lezen on public.prikklok_pogingen;
create policy prikklok_pogingen_lezen on public.prikklok_pogingen
  for select to authenticated using ((select public.is_platform_gebruiker()));
