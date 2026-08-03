-- Objectenbeheer — vastgoedobjecten (VvE / complex / pand) waaraan dossiers hangen
--
-- Aanleiding: het werkadres staat vandaag plat op `dossiers` (werkadres_straat/…,
-- vve_code). Er is dus geen entiteit die twee dossiers op hetzelfde complex met
-- elkaar verbindt: je kunt niet zien wat er in de loop der jaren op een VvE is
-- gedaan, en bij elke nieuwe aanvraag wordt het adres opnieuw ingetypt.
--
-- Bouw7 heeft deze entiteit al — `property-assets` (geverifieerd tegen de live API,
-- aug 2026): 46 objecten, en 174 van de 579 projecten dragen een `propertyAsset`.
-- Het is aantoonbaar een gedeeld object: Zamenhofstraat 6 hangt aan 18 projecten,
-- Porseleinen Toren aan 17. EVA spiegelt die entiteit en verrijkt hem.
--
-- Deze migratie is puur ADDITIEF: nieuwe tabellen/enums plus drie nullable kolommen
-- op `dossiers`. De module zit achter env-flag NEXT_PUBLIC_FEATURE_OBJECTEN.
--
-- Naamkeuze: `vastgoed_objecten`, niet `objecten` — `materieel_objecten` bestaat al
-- (gereedschap/machines) en een kale naam maakt elke grep dubbelzinnig. De FK-kolom
-- op dossiers heet wel gewoon `object_id`.
--
-- LET OP bij het matchen van adressen: Bouw7 zet de héle adressenreeks in
-- `streetName` ("Netscherstraat 9 t/m 91 / Ruijsdaelstraat 65 t/m 73") en laat
-- `zipCode`/`houseNumber` dan leeg. Postcode is dus GEEN betrouwbare sleutel —
-- daarom is `adres_sleutel` hieronder wel geïndexeerd maar niet uniek.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'vastgoed_object_soort') then
    create type vastgoed_object_soort as enum ('vve','complex','pand','locatie','overig');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'vastgoed_object_rol') then
    create type vastgoed_object_rol as enum ('vve','eigenaar','beheerder','opdrachtgever','overig');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Gedeelde updated_at-trigger
-- ---------------------------------------------------------------------------
create or replace function public.vastgoed_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- vastgoed_objecten — het object zelf
-- ---------------------------------------------------------------------------
create table if not exists public.vastgoed_objecten (
  id                          uuid primary key default gen_random_uuid(),

  -- Identiteit. `objectnummer` = Bouw7 `number` (met de hand getypt: HW1013,
  -- KESSZAM6, OMMEREN) en is daar de feitelijke sleutel; verplicht bij aanmaken.
  objectnummer                text not null,
  naam                        text not null,
  soort                       vastgoed_object_soort not null default 'complex',
  vve_code                    text,

  -- Adres. `adres_straat` mag een hele reeks bevatten (zo levert Bouw7 het aan);
  -- `omschrijving` is de vrije opsomming (Bouw7 `description`, bevat HTML).
  adres_straat                text,
  adres_huisnummer            text,
  adres_postcode              text,
  adres_plaats                text,
  adres_land                  text not null default 'NL',
  omschrijving                text,
  lat                         double precision,
  lng                         double precision,
  geocode_bron                text,

  -- Contactpersoon ter plaatse (huismeester/beheerder) — EVA-eigen, kent Bouw7 niet.
  contact_naam                text,
  contact_telefoon            text,
  contact_email               text,

  -- Voorinvullen bij het koppelen van een dossier.
  standaard_opdrachtgever_id  uuid references public.relaties(id) on delete set null,
  standaard_contactpersoon_id uuid references public.contactpersonen(id) on delete set null,

  -- Uit Bouw7 overgenomen opleverdata (lossless import).
  eerste_opleverdatum         date,
  tweede_opleverdatum         date,

  notities                    text,
  details                     jsonb not null default '{}'::jsonb,

  -- Reservekolom voor een later complex → gebouw-niveau. Bewust zonder UI: de
  -- VvE/het complex ís het object, dit voorkomt alleen een migratie achteraf.
  hoort_bij_object_id         uuid references public.vastgoed_objecten(id) on delete set null,

  -- Bouw7-spiegeling.
  bouw7_property_asset_id     bigint,
  bouw7_laatst_sync           timestamptz,
  bouw7_sync_status           text,
  bouw7_sync_fout             text,
  bouw7_sync_hash             text,

  bron                        text not null default 'eva' check (bron in ('eva','bouw7','backfill')),
  backfill_run_id             uuid,
  actief                      boolean not null default true,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  created_by                  uuid references public.medewerkers(id) on delete set null,

  -- Hulpsleutel voor adresmatching en driftdetectie. NIET uniek: Bouw7 laat de
  -- postcode bij complexen met een adressenreeks leeg, dus deze sleutel is voor
  -- een flink deel van de objecten '|'.
  adres_sleutel text generated always as (
    upper(regexp_replace(coalesce(adres_postcode,''), '\s', '', 'g')) || '|' ||
    coalesce((regexp_match(coalesce(adres_huisnummer,''), '\d+'))[1], '')
  ) stored
);

-- Uniciteit van een Bouw7-object komt van het asset-id, NIET van het nummer:
-- `number` is in Bouw7 aantoonbaar niet uniek (HW1013 en HW1149 staan er elk twee
-- keer in). Een harde unique index op het nummer maakte die objecten onimporteerbaar.
-- Nummer-uniciteit geldt daarom alleen voor objecten die in EVA zijn aangemaakt,
-- zodat een typefout daar nog steeds geen duplicaat oplevert.
create unique index if not exists uq_vastgoed_objecten_bouw7
  on public.vastgoed_objecten (bouw7_property_asset_id)
  where bouw7_property_asset_id is not null;
create unique index if not exists uq_vastgoed_objecten_nummer_eva
  on public.vastgoed_objecten (upper(objectnummer))
  where bouw7_property_asset_id is null;
create index if not exists idx_vastgoed_objecten_nummer
  on public.vastgoed_objecten (upper(objectnummer));

create index if not exists idx_vastgoed_objecten_soort    on public.vastgoed_objecten (soort);
create index if not exists idx_vastgoed_objecten_actief   on public.vastgoed_objecten (actief);
create index if not exists idx_vastgoed_objecten_klant    on public.vastgoed_objecten (standaard_opdrachtgever_id);
create index if not exists idx_vastgoed_objecten_backfill on public.vastgoed_objecten (backfill_run_id);
create index if not exists idx_vastgoed_objecten_adres    on public.vastgoed_objecten (adres_sleutel);
create index if not exists idx_vastgoed_objecten_vve      on public.vastgoed_objecten (upper(vve_code)) where vve_code is not null;

drop trigger if exists trg_vastgoed_objecten_updated on public.vastgoed_objecten;
create trigger trg_vastgoed_objecten_updated
  before update on public.vastgoed_objecten
  for each row execute function public.vastgoed_touch_updated_at();

-- ---------------------------------------------------------------------------
-- vastgoed_object_relaties — M:N met rol
--
-- Bewust géén enkele `relatie_id` op het object: bij een VvE zijn de vereniging,
-- de beheerder en de factuurbetalende partij structureel verschillende relaties
-- die tegelijk waar zijn. Patroon = contactpersoon_organisaties.
-- `standaard_opdrachtgever_id` op het object blijft daarnaast bestaan zodat het
-- voorinvullen één lookup is en geen rol-resolutie.
-- ---------------------------------------------------------------------------
create table if not exists public.vastgoed_object_relaties (
  id         uuid primary key default gen_random_uuid(),
  object_id  uuid not null references public.vastgoed_objecten(id) on delete cascade,
  relatie_id uuid not null references public.relaties(id)          on delete cascade,
  rol        vastgoed_object_rol not null,
  primair    boolean not null default false,
  opmerking  text,
  created_at timestamptz not null default now(),
  unique (object_id, relatie_id, rol)
);
create index if not exists idx_vor_object  on public.vastgoed_object_relaties (object_id);
create index if not exists idx_vor_relatie on public.vastgoed_object_relaties (relatie_id);

-- ---------------------------------------------------------------------------
-- Dossierkoppeling
--
-- `object_id` is een PREFILL-relatie, geen live join: de werkadres_*-kolommen op
-- het dossier blijven de bron voor documenten, planning, werkbon en Bouw7. Het
-- object vult ze bij het koppelen éénmalig, daarna lopen ze zelfstandig door.
-- ---------------------------------------------------------------------------
alter table public.dossiers
  add column if not exists object_id uuid references public.vastgoed_objecten(id) on delete set null,
  add column if not exists object_gekoppeld_op timestamptz,
  add column if not exists object_koppel_bron text
    check (object_koppel_bron in ('aanmaak','handmatig','bouw7','backfill'));

create index if not exists idx_dossiers_object on public.dossiers (object_id);

-- ---------------------------------------------------------------------------
-- RLS — platform-gebruiker-policy (net als de rest van het platform)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tabellen text[] := array['vastgoed_objecten','vastgoed_object_relaties'];
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
