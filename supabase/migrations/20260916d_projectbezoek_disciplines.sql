-- ============================================================================
-- Het projectbezoek gaat over disciplines.
--
-- Het bezoek was een container met vier vinkjes — Kwaliteit, Veiligheid, Algemeen,
-- Voortgang — waarbij "Kwaliteit" een volledige kwaliteitsronde startte met 22
-- disciplines en 167 controlepunten. Dat is in de praktijk blijven liggen: 7 bezoeken,
-- geen enkele afgerond, 3 inspecties die allemaal op concept bleven staan.
--
-- De reden is dat de indeling niet aansluit op hoe een projectleider kijkt. Hij loopt
-- over een werk en beoordeelt VAKKEN — schilderwerk, houtrot, voegwerk — niet abstracte
-- categorieën. Vanaf nu is dat de opbouw: kies je disciplines, leg er punten bij vast
-- met tekst en foto, en geef per vak aan hoe ver het is.
--
-- Ontwerpkeuzes die de moeite van het onthouden waard zijn:
--
--  * DE DISCIPLINELIJST WORDT GEDEELD met de kwaliteitsmodule (`kwaliteit_disciplines`).
--    Geen kopie: twee lijsten die hetzelfde bedoelen lopen gegarandeerd uit elkaar, en
--    de beheerder zou ze allebei moeten bijhouden. `ALG` (Algemeen) doet niet mee in het
--    bezoek — daar is het vrije veld "Algemene opmerkingen" voor.
--
--  * PUNTEN KRIJGEN EEN EIGEN TABEL, geen rij in `oplever_punten`. Een projectleider
--    legt tijdens een bezoek van alles vast wat geen opvolging nodig heeft. Zou elk punt
--    in het meldingenregister landen, dan loopt dat vol met waarnemingen die niemand
--    afhandelt. Het vinkje `is_aandachtspunt` bepaalt of er een rij bij komt; die rij is
--    afgeleid en verwijst terug via `oplever_punt_id`.
--
--  * FOTO'S BLIJVEN IN ÉÉN BUCKET. `projectbezoek_fotos` krijgt er een `punt_id` bij in
--    plaats van dat een punt zijn eigen fototabel krijgt. Eén upload-pad, één bucket
--    (`bezoek-fotos`), één verwijderpad.
--
--  * DE VIER `doet_*` KOLOMMEN BLIJVEN VOORLOPIG STAAN. Ze zijn `not null default false`,
--    dus code die ze negeert werkt en code die ze nog schrijft ook. Weghalen gebeurt in
--    een aparte migratie nadat de nieuwe code op productie draait — een kolom droppen
--    terwijl de vorige build nog verkeer afhandelt, breekt die build.
-- ============================================================================

-- ── 1. Naamswijziging ───────────────────────────────────────────────────────
-- "Schilderwerk hout" was te smal: het vak heet gewoon schilderwerk, en op een
-- projectbezoek gaat het net zo goed over staal of stuc.
update public.kwaliteit_disciplines
   set naam = 'Schilderwerk', updated_at = now()
 where code = 'SCH';

-- ── 2. Gekozen disciplines per bezoek, met de voortgang van dat vak ─────────
create table if not exists public.projectbezoek_disciplines (
  id              uuid primary key default gen_random_uuid(),
  bezoek_id       uuid not null references public.projectbezoeken(id) on delete cascade,
  discipline_code text not null references public.kwaliteit_disciplines(code) on delete restrict,

  -- Null = niet opgegeven. Bewust géén default 0: "nog niet beoordeeld" en "0 % gereed"
  -- zijn verschillende uitspraken en het rapport hoort ze niet door elkaar te halen.
  voortgang_pct   int check (voortgang_pct between 0 and 100),

  volgorde        int  not null default 0,
  created_at      timestamptz not null default now(),
  unique (bezoek_id, discipline_code)
);

create index if not exists ix_projectbezoek_disciplines_bezoek
  on public.projectbezoek_disciplines (bezoek_id, volgorde);

-- ── 3. Losse punten per discipline ──────────────────────────────────────────
create table if not exists public.projectbezoek_punten (
  id               uuid primary key default gen_random_uuid(),
  bezoek_id        uuid not null references public.projectbezoeken(id) on delete cascade,
  discipline_code  text not null references public.kwaliteit_disciplines(code) on delete restrict,

  -- Loopt per bezoek. Weergave: P-03.
  volgnummer       int  not null,

  tekst            text not null,
  is_aandachtspunt boolean not null default false,

  -- Gevuld zolang het vinkje aan staat: de afgeleide rij in het meldingenregister.
  -- `on delete set null` en niet cascade: een aandachtspunt dat op het dossier is
  -- opgepakt mag niet verdwijnen doordat iemand het bezoek opruimt.
  oplever_punt_id  uuid references public.oplever_punten(id) on delete set null,

  volgorde         int  not null default 0,
  created_at       timestamptz not null default now(),
  created_by       uuid references public.medewerkers(id) on delete set null
);

create unique index if not exists uq_projectbezoek_punt_volgnummer
  on public.projectbezoek_punten (bezoek_id, volgnummer);
create index if not exists ix_projectbezoek_punten_bezoek
  on public.projectbezoek_punten (bezoek_id, volgorde);

-- Volgnummer server-side toekennen, net als bij het bezoek zelf (20260907c): twee punten
-- die tegelijk binnenkomen zouden anders hetzelfde nummer krijgen.
create or replace function public.tg_projectbezoek_punt_volgnummer()
returns trigger
language plpgsql
as $$
begin
  if new.volgnummer is null or new.volgnummer = 0 then
    select coalesce(max(volgnummer), 0) + 1
      into new.volgnummer
      from public.projectbezoek_punten
     where bezoek_id = new.bezoek_id;
  end if;
  return new;
end $$;

drop trigger if exists projectbezoek_punt_volgnummer on public.projectbezoek_punten;
create trigger projectbezoek_punt_volgnummer
  before insert on public.projectbezoek_punten
  for each row execute function public.tg_projectbezoek_punt_volgnummer();

-- ── 4. Foto's kunnen nu ook bij een punt horen ──────────────────────────────
alter table public.projectbezoek_fotos
  add column if not exists punt_id uuid
    references public.projectbezoek_punten(id) on delete cascade;

create index if not exists ix_projectbezoek_fotos_punt
  on public.projectbezoek_fotos (punt_id) where punt_id is not null;

do $soort$
begin
  alter table public.projectbezoek_fotos drop constraint if exists projectbezoek_fotos_soort_check;
  alter table public.projectbezoek_fotos
    add constraint projectbezoek_fotos_soort_check
    check (soort in ('voortgang','algemeen','punt'));
end $soort$;

-- ── 5. RLS ──────────────────────────────────────────────────────────────────
do $rls$
declare
  t text;
  tabellen text[] := array['projectbezoek_disciplines','projectbezoek_punten'];
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

-- ── 6. De kwaliteitsronde verdwijnt als koppeling op een actie ──────────────
-- De vlag blijft als kolom bestaan (oude builds schrijven hem nog), maar hij staat
-- nergens meer aan en is niet meer aan te zetten. Eén rij: de sjabloontaak
-- "Projectbezoek", die per ongeluk beide vlaggen droeg.
update public.tasks
   set kwaliteit_ronde = false, updated_at = now()
 where kwaliteit_ronde;
