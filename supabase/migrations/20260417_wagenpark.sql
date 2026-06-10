-- =====================================================================
-- Everts Platform — Wagenpark-beheer (voertuigen, RDW, lease, ULU, compliance)
-- =====================================================================
-- Legt het schema voor de nieuwe Wagenpark-app (apps/wagenpark, port 3005).
-- Bevat:
--   • voertuigen  + voertuig_bestuurders (koppeling ↔ medewerkers)
--   • lease_contracten
--   • rdw_data  (cache RDW Open Data)
--   • ulu_imports + ulu_trips + ulu_parking (imports uit ULU Cartracker)
--   • handboek_regels + compliance_bevindingen + compliance_feedback
--
-- Optionele koppeling met tabellen uit 20260415_platform_core.draft.sql:
--   public.medewerkers, public.relaties
-- Deze migratie is bewust zelfstandig — FK-constraints naar externe tabellen
-- zijn NIET gezet zodat wagenpark ook zonder platform_core kan draaien.
-- Koppeling gebeurt op applicatie-niveau; zodra platform_core is uitgevoerd
-- kan een vervolg-migratie FK's toevoegen.
-- =====================================================================

-- =====================================================================
-- 1. ENUMS
-- =====================================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'voertuig_type') then
    create type voertuig_type as enum (
      'werkbus', 'bestelwagen', 'station_mini_suv', 'station_midi_suv',
      'personenauto', 'aanhanger', 'overig'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'brandstof_type') then
    create type brandstof_type as enum (
      'diesel', 'benzine', 'elektrisch', 'hybride', 'lpg', 'waterstof', 'onbekend'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'voertuig_status') then
    create type voertuig_status as enum (
      'actief', 'in_onderhoud', 'uit_dienst', 'verkocht'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'rit_type_berekend') then
    create type rit_type_berekend as enum ('zakelijk', 'prive');
  end if;
  if not exists (select 1 from pg_type where typname = 'bevinding_ernst') then
    create type bevinding_ernst as enum ('info', 'waarschuwing', 'overtreding');
  end if;
  if not exists (select 1 from pg_type where typname = 'bevinding_status') then
    create type bevinding_status as enum (
      'open', 'geaccepteerd_uitzondering', 'opgelost', 'afgewezen'
    );
  end if;
end $$;

-- =====================================================================
-- 2. VOERTUIGEN — kern-entiteit van de vloot
-- =====================================================================
create table if not exists public.voertuigen (
  id                        uuid primary key default gen_random_uuid(),
  kenteken                  text not null unique,
  merk                      text,
  model                     text,
  type                      voertuig_type,
  brandstof                 brandstof_type default 'onbekend',
  kleur                     text,
  ingebruikname_datum       date,
  bouwjaar                  int,
  -- Compliance-drijvende velden
  bijtelling_betaald        boolean not null default false,
  prive_limiet_km_jaar      int,        -- override. NULL → default uit regel-engine
  zakelijk_verwacht_km_jaar int,        -- NULL → default uit regel-engine
  -- Beheer
  status                    voertuig_status not null default 'actief',
  opmerkingen               text,
  -- Audit
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid references auth.users(id)
);
create index if not exists voertuigen_status_idx on public.voertuigen (status) where status = 'actief';
-- NB: voor fuzzy search op kenteken kan later een gin_trgm_ops index worden
-- toegevoegd als de pg_trgm extensie in public beschikbaar is.

-- Koppeling voertuig ↔ medewerker (met historie).
-- medewerker_id verwijst naar public.medewerkers als die bestaat
-- (constraint niet afgedwongen op DB-niveau voor portability).
create table if not exists public.voertuig_bestuurders (
  id             uuid primary key default gen_random_uuid(),
  voertuig_id    uuid not null references public.voertuigen(id) on delete cascade,
  medewerker_id  uuid not null,
  start_datum    date not null,
  eind_datum     date,        -- NULL = huidige bestuurder
  is_primair     boolean not null default true,
  notities       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists voertuig_best_voertuig_idx on public.voertuig_bestuurders (voertuig_id) where eind_datum is null;
create index if not exists voertuig_best_medewerker_idx on public.voertuig_bestuurders (medewerker_id) where eind_datum is null;

-- =====================================================================
-- 3. LEASE-CONTRACTEN
-- =====================================================================
create table if not exists public.lease_contracten (
  id                           uuid primary key default gen_random_uuid(),
  voertuig_id                  uuid not null references public.voertuigen(id) on delete cascade,
  leasemaatschappij_relatie_id uuid,  -- FK naar public.relaties indien aanwezig (app-level)
  contractnummer               text,
  start_datum                  date not null,
  eind_datum                   date,
  maandtermijn_bedrag          numeric(10,2),
  km_bundel_per_jaar           int,
  meer_km_tarief               numeric(6,4),
  minder_km_tarief             numeric(6,4),
  bijtelling_percentage        numeric(5,2),
  contract_document_url        text,
  opmerkingen                  text,
  actief                       boolean not null default true,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);
create index if not exists lease_voertuig_idx on public.lease_contracten (voertuig_id) where actief;

-- =====================================================================
-- 4. RDW-DATA — cache van RDW Open Data per voertuig
-- =====================================================================
create table if not exists public.rdw_data (
  id                         uuid primary key default gen_random_uuid(),
  voertuig_id                uuid unique references public.voertuigen(id) on delete cascade,
  kenteken                   text not null unique,
  apk_vervaldatum            date,
  massa_ledig_voertuig       int,
  massa_rijklaar             int,
  toegestane_maximum_massa   int,
  aantal_zitplaatsen         int,
  aantal_cilinders           int,
  cilinderinhoud             int,
  brandstof_omschrijving     text,
  milieuclassificatie        text,
  wok_status                 boolean default false,          -- wachten op keuring
  vervaldatum_tenaamstelling date,
  eerste_toelating           date,
  datum_tenaamstelling       date,
  rdw_raw                    jsonb,
  laatst_opgehaald           timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create index if not exists rdw_apk_idx on public.rdw_data (apk_vervaldatum) where apk_vervaldatum is not null;

-- =====================================================================
-- 5. ULU IMPORTS — audit van xlsx-uploads (of later API-batches)
-- =====================================================================
create table if not exists public.ulu_imports (
  id             uuid primary key default gen_random_uuid(),
  bestandsnaam   text,
  bron           text not null default 'excel',  -- 'excel' | 'api'
  type           text not null,                   -- 'trips' | 'parking'
  aantal_rijen   int,
  periode_start  date,
  periode_eind   date,
  upload_door    uuid references auth.users(id),
  aangemaakt_op  timestamptz not null default now()
);

-- =====================================================================
-- 6. ULU TRIPS — geïmporteerde ritten
-- =====================================================================
create table if not exists public.ulu_trips (
  id                     uuid primary key default gen_random_uuid(),
  voertuig_id            uuid references public.voertuigen(id) on delete set null,
  medewerker_id          uuid,           -- FK naar public.medewerkers indien aanwezig (app-level)
  bestuurder_naam_raw    text,           -- zoals aangeleverd in ULU-export
  kenteken               text not null,
  start_datum            date not null,
  start_tijd             time not null,
  stop_tijd              time,
  adres_start            text,
  adres_stop             text,
  afstand_km             numeric(8,3),
  duur_seconden          int,
  km_stand_start         numeric(12,3),
  km_stand_stop          numeric(12,3),
  rit_type_ulu           text,           -- 'Zakelijk' / 'Privé' / 'Correctie' / 'Woon werk'
  rit_type_berekend      rit_type_berekend,
  score                  int,
  import_batch_id        uuid references public.ulu_imports(id) on delete set null,
  created_at             timestamptz not null default now(),
  unique (kenteken, start_datum, start_tijd)
);
create index if not exists ulu_trips_voertuig_idx   on public.ulu_trips (voertuig_id, start_datum);
create index if not exists ulu_trips_medewerker_idx on public.ulu_trips (medewerker_id, start_datum);
create index if not exists ulu_trips_datum_idx      on public.ulu_trips (start_datum);
create index if not exists ulu_trips_score_low_idx  on public.ulu_trips (score) where score < 70;

-- Trigger: bereken rit_type_berekend op basis van werktijd-regel
-- Regel (bevestigd door user 17-apr-2026):
--   weekdag (ma-vr) 07:00 ≤ starttijd < 17:00  →  zakelijk
--   anders (avond/nacht/weekend)               →  prive
create or replace function public.tg_ulu_trips_bereken_rit_type() returns trigger as $$
declare
  v_dow int;  -- 0=zondag .. 6=zaterdag
begin
  v_dow := extract(dow from new.start_datum);
  if v_dow in (0, 6) then
    new.rit_type_berekend := 'prive';
  elsif new.start_tijd >= time '07:00' and new.start_tijd < time '17:00' then
    new.rit_type_berekend := 'zakelijk';
  else
    new.rit_type_berekend := 'prive';
  end if;
  return new;
end;
$$ language plpgsql;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'bereken_rit_type_insert') then
    create trigger bereken_rit_type_insert
      before insert on public.ulu_trips
      for each row execute function public.tg_ulu_trips_bereken_rit_type();
    create trigger bereken_rit_type_update
      before update of start_datum, start_tijd on public.ulu_trips
      for each row execute function public.tg_ulu_trips_bereken_rit_type();
  end if;
end $$;

-- =====================================================================
-- 7. ULU PARKING — geïmporteerde parkeer-records
-- =====================================================================
create table if not exists public.ulu_parking (
  id                 uuid primary key default gen_random_uuid(),
  voertuig_id        uuid references public.voertuigen(id) on delete set null,
  kenteken           text not null,
  parkeer_starttijd  timestamptz not null,
  parkeerlocatie     text,
  parkeerkosten      numeric(8,2),
  duur_seconden      int,
  import_batch_id    uuid references public.ulu_imports(id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (kenteken, parkeer_starttijd)
);
create index if not exists ulu_parking_voertuig_idx on public.ulu_parking (voertuig_id, parkeer_starttijd);

-- =====================================================================
-- 8. HANDBOEK REGELS — beheerbare compliance-regels
-- =====================================================================
create table if not exists public.handboek_regels (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,         -- R1, R2a, R2b, R3, R5, R6, R7
  titel          text not null,
  beschrijving   text,
  actief         boolean not null default true,
  drempel_config jsonb not null default '{}'::jsonb,
  aangemaakt_op  timestamptz not null default now(),
  gewijzigd_op   timestamptz not null default now()
);

-- Seed default regels (uit memory project_ulu_handboek_analyse.md)
insert into public.handboek_regels (code, titel, beschrijving, drempel_config) values
  ('R1',  'Werktijd en pauze',
          'Ritten buiten weekdagen 07:00-17:00 worden als privé geteld. Pauzes rond 10:00 en 13:00 zijn verplicht.',
          '{"werktijd_start":"07:00","werktijd_eind":"17:00","pauze_koffie":"10:00","pauze_lunch":"13:00"}'::jsonb),
  ('R2a', 'Privé-km mét bijtelling',
          'Vuistregel: ~12.000 km zakelijk + ~8.000 km privé per jaar.',
          '{"prive_km_waarschuwing":8000,"prive_km_overtreding":10000,"zakelijk_verwacht":12000}'::jsonb),
  ('R2b', 'Privé-km zonder bijtelling',
          'Max 500 privé-km per jaar (handboek).',
          '{"prive_km_overtreding":500}'::jsonb),
  ('R3',  'Buitenlandse ritten',
          'Tankpas alleen binnen Nederland. Buitenlandse locaties = info-signaal.',
          '{}'::jsonb),
  ('R5',  'Reistijd >1u',
          'Meer dan 60 min reistijd per dag → reisuren mogelijk (info voor HR).',
          '{"drempel_minuten":60}'::jsonb),
  ('R6',  'Rijgedrag-score',
          'Rit score <70 = waarschuwing, <50 = overtreding.',
          '{"score_waarschuwing":70,"score_overtreding":50}'::jsonb),
  ('R7',  'Weekendrit met ULU-markering zakelijk',
          'Weekendritten gemarkeerd als "Zakelijk" in ULU-app → info voor leermoment.',
          '{}'::jsonb)
on conflict (code) do nothing;

-- =====================================================================
-- 9. COMPLIANCE BEVINDINGEN — afwijkingen per rit of periode
-- =====================================================================
create table if not exists public.compliance_bevindingen (
  id              uuid primary key default gen_random_uuid(),
  regel_code      text not null references public.handboek_regels(code),
  voertuig_id     uuid references public.voertuigen(id) on delete set null,
  medewerker_id   uuid,  -- FK naar public.medewerkers indien aanwezig (app-level)
  trip_id         uuid references public.ulu_trips(id) on delete cascade,
  periode_start   date,
  periode_eind    date,
  ernst           bevinding_ernst not null default 'waarschuwing',
  omschrijving    text not null,
  data            jsonb not null default '{}'::jsonb,
  status          bevinding_status not null default 'open',
  gegenereerd_op  timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists bev_status_idx        on public.compliance_bevindingen (status) where status = 'open';
create index if not exists bev_medewerker_idx    on public.compliance_bevindingen (medewerker_id, gegenereerd_op desc);
create index if not exists bev_voertuig_idx      on public.compliance_bevindingen (voertuig_id, gegenereerd_op desc);
create index if not exists bev_regel_idx         on public.compliance_bevindingen (regel_code);

-- =====================================================================
-- 10. COMPLIANCE FEEDBACK — zelflerende laag (user-acties op bevindingen)
-- =====================================================================
create table if not exists public.compliance_feedback (
  id             uuid primary key default gen_random_uuid(),
  bevinding_id   uuid not null references public.compliance_bevindingen(id) on delete cascade,
  gebruiker_id   uuid references auth.users(id) on delete set null,
  actie          text not null,        -- 'markeer_uitzondering' | 'pas_regel_aan' | 'negeer_voor_bestuurder' | 'bevestig_overtreding'
  toelichting    text,
  aangemaakt_op  timestamptz not null default now()
);
create index if not exists feedback_bevinding_idx on public.compliance_feedback (bevinding_id);

-- =====================================================================
-- 11. TRIGGERS updated_at
-- =====================================================================
-- Zorg dat de gedeelde trigger-functie bestaat (zelfde body als in
-- platform_core; create-or-replace is idempotent).
create or replace function public.tg_set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at_voertuigen') then
    create trigger set_updated_at_voertuigen             before update on public.voertuigen             for each row execute function public.tg_set_updated_at();
    create trigger set_updated_at_voertuig_bestuurders   before update on public.voertuig_bestuurders   for each row execute function public.tg_set_updated_at();
    create trigger set_updated_at_lease_contracten       before update on public.lease_contracten       for each row execute function public.tg_set_updated_at();
    create trigger set_updated_at_rdw_data               before update on public.rdw_data               for each row execute function public.tg_set_updated_at();
    create trigger set_updated_at_compliance_bevindingen before update on public.compliance_bevindingen for each row execute function public.tg_set_updated_at();
  end if;
end $$;

-- handboek_regels heeft eigen 'gewijzigd_op' kolom
create or replace function public.tg_set_gewijzigd_op() returns trigger as $$
begin new.gewijzigd_op = now(); return new; end;
$$ language plpgsql;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_gewijzigd_op_handboek_regels') then
    create trigger set_gewijzigd_op_handboek_regels before update on public.handboek_regels
      for each row execute function public.tg_set_gewijzigd_op();
  end if;
end $$;

-- =====================================================================
-- 12. VIEW: v_bestuurders_overzicht — alleen aanmaken als medewerkers bestaat
-- =====================================================================
do $$ begin
  if to_regclass('public.medewerkers') is not null then
    execute $view$
      create or replace view public.v_bestuurders_overzicht as
      select
        m.id                                                    as medewerker_id,
        m.voornaam || ' ' || coalesce(m.tussenvoegsel || ' ', '') || m.achternaam as volledige_naam,
        v.id                                                    as voertuig_id,
        v.kenteken,
        v.bijtelling_betaald,
        v.status                                                as voertuig_status,
        vb.start_datum                                          as koppeling_start,
        (select count(*) from public.ulu_trips t
            where t.medewerker_id = m.id
              and t.start_datum >= date_trunc('year', now())::date) as ritten_ytd,
        (select coalesce(sum(afstand_km), 0) from public.ulu_trips t
            where t.medewerker_id = m.id
              and t.start_datum >= date_trunc('year', now())::date
              and t.rit_type_berekend = 'zakelijk')             as km_zakelijk_ytd,
        (select coalesce(sum(afstand_km), 0) from public.ulu_trips t
            where t.medewerker_id = m.id
              and t.start_datum >= date_trunc('year', now())::date
              and t.rit_type_berekend = 'prive')                as km_prive_ytd,
        (select count(*) from public.compliance_bevindingen b
            where b.medewerker_id = m.id
              and b.status = 'open')                            as bevindingen_open
      from public.medewerkers m
      left join public.voertuig_bestuurders vb
        on vb.medewerker_id = m.id and vb.eind_datum is null
      left join public.voertuigen v
        on v.id = vb.voertuig_id
    $view$;
  end if;
end $$;

-- =====================================================================
-- EINDE 20260417_wagenpark.sql
-- =====================================================================
