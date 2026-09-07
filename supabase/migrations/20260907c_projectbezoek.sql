-- ============================================================================
-- Projectbezoek — de projectleider legt op locatie vast wat hij daar doet.
--
-- Tot nu toe was een bezoekrapport een AFGELEIDE van iets dat elders was
-- vastgelegd: een kwaliteitsronde, een oplevering, een formulier. Dat werkt zolang
-- die registratie er al is, maar het beantwoordt niet de vraag "ik sta op de
-- bouwplaats, ik wil een rapportage maken". Daarvoor is dit de container: één bezoek,
-- waarin de projectleider aanvinkt wat hij gaat doen — Kwaliteit, Veiligheid,
-- Algemeen en/of Voortgang — en dat ter plekke invult.
--
-- Ontwerpkeuzes die de moeite van het onthouden waard zijn:
--
--  * ÉÉN tabel, GEEN vier. De vier onderdelen zijn booleans op het bezoek, geen
--    subtypes. Ze sluiten elkaar niet uit — een bezoek kan alle vier omvatten — en
--    het rapport maakt er hoofdstukken van die zichzelf inklappen.
--
--  * KWALITEIT WORDT NIET NAGEBOUWD. Dat is een volwaardige module met disciplines,
--    167 controlepunten, grenswaarden en metingen. Vinkt de projectleider Kwaliteit
--    aan, dan start het bezoek een gewone `kwaliteit_inspecties`-rij en verwijst
--    ernaar. De ronde zelf blijft precies wat hij is, inclusief de disciplinekeuze
--    waarmee je hem licht kunt houden.
--
--  * VEILIGHEID EN ALGEMEEN LANDEN IN `oplever_punten`. Dat register is in juli 2026
--    al gegeneraliseerd tot hét meldingenregister van een dossier: `moment_id` is
--    nullable, er is een `soort` (oplever|veiligheid) en een `bron`. Een tweede
--    puntentabel zou de statusmachine, de toewijzing, de foto's, de reactiethread en
--    de zichtbaarheid in het klantportaal allemaal opnieuw moeten uitvinden.
--    Nieuw is alleen `bezoek_id` en de bron 'bezoek'.
--
--  * VOORTGANG IS TEKST EN FOTO'S, geen percentage. Bewuste keuze: een percentage
--    per activiteit hoort in de planning thuis en schrijft door naar Bouw7; dat is
--    een andere beslissing met andere gevolgen dan "leg vast hoe het ervoor staat".
--    Kan later alsnog, zonder dat dit model daarvoor om moet.
-- ============================================================================

-- ── 1. Het bezoek ───────────────────────────────────────────────────────────
create table if not exists public.projectbezoeken (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,

  -- Loopt per dossier. Weergave: PB-01. Bewust geen jaarreeks zoals bij de
  -- kwaliteitsinspectie: een bezoek is een dossierfeit, geen KAM-registratie met
  -- een eigen archiefnummering.
  volgnummer int not null,

  -- Gevuld wanneer het bezoek uit een geplande actie komt; leeg bij een ad-hoc
  -- bezoek dat vanaf het dossier is gestart. Beide moeten kunnen: een projectleider
  -- staat vaak ongepland op locatie, maar een maandelijkse ronde wil je inplannen.
  task_id uuid references public.tasks(id) on delete set null,

  datum date not null default current_date,
  tijd time,
  uitgevoerd_door uuid references public.medewerkers(id),
  weer text,
  locatie text,
  werkzaamheden text,

  -- Wat er tijdens dit bezoek is gedaan.
  doet_kwaliteit  boolean not null default false,
  doet_veiligheid boolean not null default false,
  doet_algemeen   boolean not null default false,
  doet_voortgang  boolean not null default false,

  -- Kwaliteit: verwijzing naar de echte inspectie (zie de kop).
  kwaliteit_inspectie_id uuid references public.kwaliteit_inspecties(id) on delete set null,

  -- Voortgang: hoe staat het ervoor, in woorden.
  voortgang_tekst text,

  algemene_opmerkingen text,

  -- concept → definitief. Definitief is het moment waarop er gerapporteerd mag
  -- worden; heropenen kan, met een reden, net als bij een kwaliteitsinspectie.
  status text not null default 'concept' check (status in ('concept','definitief')),
  afgerond_op timestamptz,
  heropend_reden text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Let op: dit is een MEDEWERKER-id, niet een auth-user. Zie 20260907f.
  created_by uuid references public.medewerkers(id) on delete set null
);

-- Volgnummer is uniek binnen een dossier; dat is wat PB-xx betekent.
create unique index if not exists uq_projectbezoek_volgnummer
  on public.projectbezoeken (dossier_id, volgnummer);

create index if not exists ix_projectbezoek_dossier
  on public.projectbezoeken (dossier_id, datum desc);
create index if not exists ix_projectbezoek_task
  on public.projectbezoeken (task_id) where task_id is not null;

-- Volgnummer server-side toekennen. In een trigger en niet in de applicatie, omdat
-- twee gelijktijdige bezoeken op hetzelfde dossier anders hetzelfde nummer krijgen.
create or replace function public.tg_projectbezoek_volgnummer()
returns trigger
language plpgsql
as $$
begin
  if new.volgnummer is null or new.volgnummer = 0 then
    select coalesce(max(volgnummer), 0) + 1
      into new.volgnummer
      from public.projectbezoeken
     where dossier_id = new.dossier_id;
  end if;
  return new;
end $$;

drop trigger if exists projectbezoek_volgnummer on public.projectbezoeken;
create trigger projectbezoek_volgnummer
  before insert on public.projectbezoeken
  for each row execute function public.tg_projectbezoek_volgnummer();

-- ── 2. Foto's bij voortgang en algemene indruk ──────────────────────────────
-- Punten (veiligheid/algemeen) hebben hun eigen foto's via `oplever_fotos`; deze
-- tabel is voor de foto's die bij het bezoek als geheel horen.
create table if not exists public.projectbezoek_fotos (
  id uuid primary key default gen_random_uuid(),
  bezoek_id uuid not null references public.projectbezoeken(id) on delete cascade,
  soort text not null default 'voortgang' check (soort in ('voortgang','algemeen')),
  url text not null,
  storage_path text,
  toelichting text,
  volgorde int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.medewerkers(id) on delete set null
);

create index if not exists ix_projectbezoek_fotos_bezoek
  on public.projectbezoek_fotos (bezoek_id, soort, volgorde);

-- ── 3. Punten koppelen aan het bezoek ───────────────────────────────────────
-- `oplever_punten` is al het meldingenregister van het dossier; hier komt alleen de
-- herkomst bij. `bron` krijgt de waarde 'bezoek' erbij — de bestaande waarden
-- blijven ongemoeid, dus bestaande rijen hoeven niet te migreren.
alter table public.oplever_punten
  add column if not exists bezoek_id uuid references public.projectbezoeken(id) on delete set null;

create index if not exists ix_oplever_punten_bezoek
  on public.oplever_punten (bezoek_id) where bezoek_id is not null;

do $bron$
begin
  alter table public.oplever_punten drop constraint if exists oplever_punten_bron_check;
  alter table public.oplever_punten
    add constraint oplever_punten_bron_check
    check (bron in ('handmatig','formulier','bezoek'));
end $bron$;

-- ── 4. De actie-ingang ──────────────────────────────────────────────────────
-- Zelfde patroon als `kwaliteit_ronde` en `opname_ronde`: een vlag op de taak maakt
-- er een doorloop van, met één groene startknop op de telefoon.
alter table public.tasks
  add column if not exists bezoek_ronde boolean not null default false;

comment on column public.tasks.bezoek_ronde is
  'Deze actie start een projectbezoek (/m/taken/<id>/bezoek). Zelfde mechaniek als kwaliteit_ronde.';

-- ── 5. RLS ──────────────────────────────────────────────────────────────────
do $rls$
declare
  t text;
  tabellen text[] := array['projectbezoeken','projectbezoek_fotos'];
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

-- ── 6. Fotobucket ───────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bezoek-fotos', 'bezoek-fotos', true, 26214400,
  array['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do nothing;

do $buckets$
begin
  if not exists (select 1 from pg_policies where policyname = 'Bezoek-fotos lezen' and tablename = 'objects') then
    create policy "Bezoek-fotos lezen"
      on storage.objects for select to authenticated
      using (bucket_id = 'bezoek-fotos' and is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Bezoek-fotos uploaden' and tablename = 'objects') then
    create policy "Bezoek-fotos uploaden"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'bezoek-fotos' and is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Bezoek-fotos verwijderen' and tablename = 'objects') then
    create policy "Bezoek-fotos verwijderen"
      on storage.objects for delete to authenticated
      using (bucket_id = 'bezoek-fotos' and is_platform_gebruiker());
  end if;
end $buckets$;
