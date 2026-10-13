-- Inkoopfacturen goedkeuren in EVA (okt 2026).
--
-- Tom haalt de goedkeuringsstap in Bouw7 weg. Facturen die al in een Bouw7-keten zitten maken die
-- daar af; facturen die ná `bedrijfsinstellingen.overige.inkoop_goedkeuring_eva_vanaf` in Bouw7
-- zijn aangemaakt en géén Bouw7-approval hebben, keurt EVA goed. Na het laatste akkoord zet EVA in
-- Bouw7 een tekstregel in `comments` (wie, wanneer) en daarna de status op 2. Zie
-- lib/bouw7/WRITE-ENDPOINTS.md §7c en lib/inkoopfacturen/goedkeuren.ts.

-- Wie beslist over deze factuur: Bouw7 (oude keten) of EVA. Null = nog niet bepaald.
alter table public.inkoopfacturen
  add column if not exists goedkeuring_bron text check (goedkeuring_bron in ('bouw7', 'eva')),
  add column if not exists eva_besluit text check (eva_besluit in ('goedgekeurd', 'afgekeurd')),
  add column if not exists eva_besluit_op timestamptz,
  add column if not exists eva_besluit_door uuid references public.medewerkers(id) on delete set null,
  add column if not exists bouw7_bijgewerkt_op timestamptz;

comment on column public.inkoopfacturen.goedkeuring_bron is
  'bouw7 = de goedkeuringsketen loopt in Bouw7 (doorklik); eva = EVA keurt goed en schrijft status + comments naar Bouw7. Null = nog niet bepaald.';
comment on column public.inkoopfacturen.eva_besluit is
  'Eindbesluit van de EVA-goedkeuring. Staat dit er maar is bouw7_bijgewerkt_op leeg, dan moet de Bouw7-write nog (opnieuw) — zie laatste_vote_fout.';

-- De stappen van de EVA-route. Eén rij per stap; een besliste stap wordt nooit meer gewijzigd
-- (behalve "vervallen" als Bouw7 de factuur buiten EVA om afhandelt). Dit is het audit-spoor.
create table if not exists public.inkoop_goedkeur_stappen (
  id                uuid primary key default gen_random_uuid(),
  inkoopfactuur_id  uuid not null references public.inkoopfacturen(id) on delete cascade,
  stap              integer not null,
  soort             text not null check (soort in ('projectleider', 'terugval', 'drempel')),
  goedkeurder_id    uuid references public.medewerkers(id) on delete set null,
  status            text not null default 'wacht' check (status in ('wacht', 'open', 'akkoord', 'bezwaar', 'vervallen')),
  beoordeeld_door   uuid references public.medewerkers(id) on delete set null,
  beoordeeld_op     timestamptz,
  toelichting       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (inkoopfactuur_id, stap)
);
create index if not exists inkoop_goedkeur_stappen_open_idx
  on public.inkoop_goedkeur_stappen (goedkeurder_id) where status = 'open';

comment on table public.inkoop_goedkeur_stappen is
  'EVA-goedkeuringsroute per inkoopfactuur. status: wacht (volgende stap) → open (aan zet) → akkoord | bezwaar; vervallen = buiten EVA afgehandeld.';

-- De route-instellingen. Eén rij met divisie_bouw7_id null = standaard; een rij per administratie
-- overschrijft de standaard waar hij iets invult.
create table if not exists public.inkoop_goedkeur_regels (
  id                       uuid primary key default gen_random_uuid(),
  divisie_bouw7_id         integer unique,
  terugval_goedkeurder_id  uuid references public.medewerkers(id) on delete restrict,
  drempel_excl             numeric(12, 2) check (drempel_excl is null or drempel_excl >= 0),
  drempel_goedkeurder_id   uuid references public.medewerkers(id) on delete restrict,
  updated_at               timestamptz not null default now(),
  updated_by               uuid references public.medewerkers(id) on delete set null
);
create unique index if not exists inkoop_goedkeur_regels_standaard_uniek
  on public.inkoop_goedkeur_regels ((divisie_bouw7_id is null)) where divisie_bouw7_id is null;

comment on table public.inkoop_goedkeur_regels is
  'Route voor EVA-goedkeuring van inkoopfacturen. Stap 1 = projectleider van het dossier, anders terugval_goedkeurder. Stap 2 alleen als bedrag_excl >= drempel_excl (drempel_goedkeurder, of leeg = iedereen uit Directie).';

-- Nieuwe gebeurtenissen voor het auditlog.
alter table public.inkoopfactuur_gebeurtenissen drop constraint if exists inkoopfactuur_gebeurtenissen_actie_check;
alter table public.inkoopfactuur_gebeurtenissen add constraint inkoopfactuur_gebeurtenissen_actie_check
  check (actie in (
    'goedgekeurd', 'afgekeurd', 'opmerking', 'vote_mislukt', 'betalen_aan', 'betalen_uit',
    'route_bepaald', 'overgedragen', 'bouw7_bijgewerkt', 'bouw7_mislukt', 'vervallen'
  ));

do $$
declare t text;
begin
  foreach t in array array['inkoop_goedkeur_stappen', 'inkoop_goedkeur_regels'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists platform_gebruikers_all on public.%I', t);
    execute format(
      'create policy platform_gebruikers_all on public.%I for all to authenticated using (is_platform_gebruiker()) with check (is_platform_gebruiker())',
      t
    );
  end loop;
end $$;

-- Bestaande facturen met een Bouw7-keten blijven van Bouw7.
update public.inkoopfacturen set goedkeuring_bron = 'bouw7'
 where goedkeuring_bron is null and bouw7_approval_id is not null;
