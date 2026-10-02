-- Extra werkadressen per dossier.
--
-- Een opdracht is soms geclusterd: meerdere vestigingen of verspreid bezit onder één dossier. Het
-- werkadres op `dossiers` (werkadres_*) blijft het hoofdadres — dat is het adres dat two-way met
-- Bouw7 meegaat, en Bouw7 kent er per project maar één. De extra adressen staan hier en zijn
-- EVA-eigen. Ze tellen mee voor de prikklok (inklokken binnen de straal van élk adres), voor
-- "dossier openen op locatie" en voor de navigatielinks op de telefoon.
--
-- Coördinaten volgen hetzelfde patroon als dossiers.adres_lat/_lng (20260729_dossier_geocode.sql):
-- de server-action geocodeert direct na opslaan, de cron-batch vangt wat daarbij misging
-- (geocode_status is null), en een trigger nult de coördinaten zodra het adres wijzigt.
--
-- Additief: geen bestaande kolommen gewijzigd.

create table if not exists public.dossier_werkadressen (
  id                uuid primary key default gen_random_uuid(),
  dossier_id        uuid not null references public.dossiers(id) on delete cascade,
  volgorde          integer not null default 0,
  -- Herkenbare naam, bijv. "Vestiging Zwolle" of "Complex Kerkstraat".
  naam              text,
  straat            text,
  huisnummer        text,
  postcode          text,
  stad              text,
  -- Aanspreekpunt op dat adres.
  contact_naam      text,
  contact_telefoon  text,

  lat               double precision,
  lng               double precision,
  geocode_status    text,
  geocode_op        timestamptz,

  aangemaakt_op     timestamptz not null default now(),
  aangemaakt_door   uuid,
  bijgewerkt_op     timestamptz not null default now(),

  constraint dossier_werkadressen_geocode_status check (geocode_status is null or geocode_status in ('ok','geen_match'))
);

comment on table public.dossier_werkadressen is
  'Extra werkadressen van een dossier (naast het hoofdadres werkadres_* op dossiers). EVA-eigen, niet naar Bouw7. Tellen mee voor prikklok, openen-op-locatie en navigatie.';

create index if not exists dossier_werkadressen_dossier_idx
  on public.dossier_werkadressen (dossier_id, volgorde);

-- Prikklok zoekt in een vak rond de GPS-positie.
create index if not exists dossier_werkadressen_lat_lng_idx
  on public.dossier_werkadressen (lat, lng)
  where lat is not null;

-- De geocode-batch pakt wat nog nooit geprobeerd is.
create index if not exists dossier_werkadressen_geocode_todo_idx
  on public.dossier_werkadressen (bijgewerkt_op)
  where geocode_status is null;

-- Adres gewijzigd → coördinaten ongeldig.
create or replace function public.dossier_werkadressen_geocode_reset() returns trigger as $$
begin
  if (new.straat     is distinct from old.straat)
  or (new.huisnummer is distinct from old.huisnummer)
  or (new.postcode   is distinct from old.postcode)
  or (new.stad       is distinct from old.stad) then
    new.lat            := null;
    new.lng            := null;
    new.geocode_status := null;
    new.geocode_op     := null;
  end if;
  new.bijgewerkt_op := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists dossier_werkadressen_geocode_reset_trg on public.dossier_werkadressen;
create trigger dossier_werkadressen_geocode_reset_trg
  before update on public.dossier_werkadressen
  for each row execute function public.dossier_werkadressen_geocode_reset();

-- Lezen mag elke platformgebruiker (ook de monteur op /m); muteren alleen via server actions op de
-- service role. Subquery-vorm tegen de initplan-valkuil.
alter table public.dossier_werkadressen enable row level security;

drop policy if exists dossier_werkadressen_select on public.dossier_werkadressen;
create policy dossier_werkadressen_select
  on public.dossier_werkadressen
  for select
  to authenticated
  using ((select public.is_platform_gebruiker()));

-- Op welk adres is ingeklokt (null = het hoofdadres). Voor de projectleider bij het keuren.
alter table public.prikklok_sessies
  add column if not exists in_werkadres_id uuid references public.dossier_werkadressen(id) on delete set null;
