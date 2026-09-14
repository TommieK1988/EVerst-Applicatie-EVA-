-- ---------------------------------------------------------------------------
-- Onkosten bij de weekstaat: bonnetje verplicht, vervoermiddel bij reiskosten
-- ---------------------------------------------------------------------------
-- De invoer was te mager om een uitbetaling op te baseren: geen bewijsstuk, en bij reiskosten
-- bedacht de medewerker het bedrag zelf. Vanaf nu:
--
--   parkeren / overig          -> bedrag invullen + foto van de bon
--   reiskosten auto/bromfiets  -> kilometers invullen, EVA rekent km x tarief; geen bon
--   reiskosten OV              -> bedrag invullen + foto van het kaartje
--
-- De tabel was leeg bij het toepassen van deze migratie, dus de constraints kunnen meteen
-- strak; er valt niets te backfillen.

-- 1. Vervoermiddel -----------------------------------------------------------
alter table public.uren_onkosten
  add column if not exists vervoermiddel text;

alter table public.uren_onkosten
  drop constraint if exists uren_onkosten_vervoermiddel_soort;
alter table public.uren_onkosten
  add constraint uren_onkosten_vervoermiddel_soort check (
    case
      when soort = 'reiskosten' then vervoermiddel in ('auto', 'bromfiets', 'ov')
      else vervoermiddel is null
    end
  );

-- Zonder kilometers valt er bij auto en bromfiets niets te vergoeden.
alter table public.uren_onkosten
  drop constraint if exists uren_onkosten_km_bij_eigen_vervoer;
alter table public.uren_onkosten
  add constraint uren_onkosten_km_bij_eigen_vervoer check (
    vervoermiddel not in ('auto', 'bromfiets') or (km is not null and km > 0)
  );

comment on column public.uren_onkosten.vervoermiddel is
  'Alleen bij soort=reiskosten. auto en bromfiets rekenen per kilometer, ov vraagt een kaartje.';

-- 2. De bon ------------------------------------------------------------------
-- We slaan het STORAGE-PAD op en geen URL: de bucket is prive en een signed URL verloopt.
-- Elk scherm tekent zelf een verse link (lib/uren/bonnen.ts).
alter table public.uren_onkosten
  add column if not exists bon_pad text;

-- bon_url was een dode kolom: nooit geschreven, nergens getoond. Twee kolommen die hetzelfde
-- lijken te doen naast elkaar laten staan is vragen om fouten.
alter table public.uren_onkosten
  drop column if exists bon_url;

comment on column public.uren_onkosten.bon_pad is
  'Pad in de prive-bucket onkosten-bonnen. Verplicht bij parkeren, overig en reiskosten per OV.';

-- 3. Kilometervergoeding als instelling --------------------------------------
-- Bedrijfskeuze, geen wetgeving: instelbaar zodat een tariefwijziging geen release vraagt.
alter table public.uren_instellingen
  add column if not exists km_vergoeding_auto numeric(5,2) not null default 0.30,
  add column if not exists km_vergoeding_bromfiets numeric(5,2) not null default 0.11;

alter table public.uren_instellingen
  drop constraint if exists uren_instellingen_km_vergoeding;
alter table public.uren_instellingen
  add constraint uren_instellingen_km_vergoeding check (
    km_vergoeding_auto >= 0 and km_vergoeding_auto < 10
    and km_vergoeding_bromfiets >= 0 and km_vergoeding_bromfiets < 10
  );

-- 4. Bucket voor de bonnetjes ------------------------------------------------
-- Prive: een bonnetje is een financieel stuk van een medewerker en hoort niet op een
-- raadbare publieke URL te staan, anders dan de foto's van werk (bezoek, oplevering).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'onkosten-bonnen', 'onkosten-bonnen', false, 26214400,
  array['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do nothing;

do $buckets$
begin
  if not exists (select 1 from pg_policies where policyname = 'Onkosten-bonnen lezen' and tablename = 'objects') then
    create policy "Onkosten-bonnen lezen"
      on storage.objects for select to authenticated
      using (bucket_id = 'onkosten-bonnen' and is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Onkosten-bonnen uploaden' and tablename = 'objects') then
    create policy "Onkosten-bonnen uploaden"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'onkosten-bonnen' and is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Onkosten-bonnen verwijderen' and tablename = 'objects') then
    create policy "Onkosten-bonnen verwijderen"
      on storage.objects for delete to authenticated
      using (bucket_id = 'onkosten-bonnen' and is_platform_gebruiker());
  end if;
end $buckets$;
