-- =====================================================================
-- Toolbox — VCA-toolboxmeetings: onderwerpen, versies, agenda-momenten,
-- toewijzingen (met taak-koppeling) en antwoord-auditlog
-- =====================================================================
-- Patronen: form_builder (template + immutabele versies met JSONB-schema),
-- changelog_gezien (per-gebruiker registratie), materieel-bestanden
-- (privé bucket met storage-pad + signed URLs).

-- ── Toolboxen (onderwerpen) ───────────────────────────────────────────
create table if not exists public.toolboxen (
  id              uuid primary key default gen_random_uuid(),
  titel           text not null,
  omschrijving    text,
  status          text not null default 'concept'
                    check (status in ('concept','gepubliceerd','gearchiveerd')),
  huidige_versie  integer not null default 0,
  -- Werkkopie voor de editor; publiceren bevriest een kopie in toolbox_versies.
  concept_schema  jsonb not null default '{"version":1,"slides":[]}'::jsonb,
  aangemaakt_door uuid references auth.users(id) on delete set null,
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now()
);
comment on table public.toolboxen is
  'Toolbox-onderwerpen (veiligheidsinstructies) met concept-schema; gepubliceerde inhoud staat bevroren in toolbox_versies.';

-- ── Versies (bevroren schema bij publicatie) ──────────────────────────
create table if not exists public.toolbox_versies (
  id                uuid primary key default gen_random_uuid(),
  toolbox_id        uuid not null references public.toolboxen(id) on delete cascade,
  versienummer      integer not null,
  schema            jsonb not null,
  gepubliceerd_door uuid references auth.users(id) on delete set null,
  gepubliceerd_op   timestamptz not null default now(),
  unique (toolbox_id, versienummer)
);
comment on table public.toolbox_versies is
  'Immutabele gepubliceerde versies: een afgetekende deelname toont exact het schema van destijds.';

-- ── Momenten (koppeling met bedrijfsagenda) ───────────────────────────
-- Herhalende agenda-items worden runtime uitgevouwen tot virtuele
-- voorkomens zonder eigen rij; daarom koppelen we op (agenda_item_id, datum).
create table if not exists public.toolbox_momenten (
  id              uuid primary key default gen_random_uuid(),
  agenda_item_id  uuid not null references public.bedrijfsagenda_items(id) on delete cascade,
  datum           date not null,
  toolbox_id      uuid not null references public.toolboxen(id) on delete cascade,
  status          text not null default 'gepland'
                    check (status in ('gepland','klaargezet','geannuleerd')),
  klaargezet_op   timestamptz,
  aangemaakt_door uuid references auth.users(id) on delete set null,
  aangemaakt_op   timestamptz not null default now(),
  bijgewerkt_op   timestamptz not null default now(),
  unique (agenda_item_id, datum)
);
comment on table public.toolbox_momenten is
  'Toolbox-onderwerp gekoppeld aan één voorkomen van een vca_toolbox-agenda-item; op de datum zet de cron toewijzingen klaar voor de doelgroep.';

-- ── Toewijzingen (deelname per medewerker) ────────────────────────────
create table if not exists public.toolbox_toewijzingen (
  id                uuid primary key default gen_random_uuid(),
  toolbox_id        uuid not null references public.toolboxen(id) on delete cascade,
  versie_id         uuid not null references public.toolbox_versies(id) on delete restrict,
  medewerker_id     uuid not null references public.medewerkers(id) on delete cascade,
  moment_id         uuid references public.toolbox_momenten(id) on delete set null,
  task_id           uuid references public.tasks(id) on delete set null,
  -- Seed voor deterministisch schudden van vragen en antwoordopties per
  -- deelnemer (niet afkijkbaar, wél reproduceerbaar voor de audit).
  shuffle_seed      integer not null,
  status            text not null default 'open'
                      check (status in ('open','bezig','afgerond')),
  laatste_slide     integer not null default 0,
  gestart_op        timestamptz,
  afgerond_op       timestamptz,
  -- Pad in de privé bucket toolbox-handtekeningen; inzien via signed URL.
  handtekening_pad  text,
  handtekening_naam text,
  toegewezen_door   uuid references auth.users(id) on delete set null,
  aangemaakt_op     timestamptz not null default now(),
  bijgewerkt_op     timestamptz not null default now(),
  unique (versie_id, medewerker_id)
);
comment on table public.toolbox_toewijzingen is
  'Deelname per medewerker aan een toolboxversie; kent geen verloop — blijft open (incl. gekoppelde taak) tot succesvolle afronding met handtekening.';

-- ── Antwoorden (append-only auditlog) ─────────────────────────────────
create table if not exists public.toolbox_antwoorden (
  id             uuid primary key default gen_random_uuid(),
  toewijzing_id  uuid not null references public.toolbox_toewijzingen(id) on delete cascade,
  vraag_id       text not null,
  -- Origineel optie-id uit het schema (niet de geschudde positie).
  gekozen_optie  text not null,
  correct        boolean not null,
  poging_nummer  integer not null,
  beantwoord_op  timestamptz not null default now()
);
comment on table public.toolbox_antwoorden is
  'Elke antwoordpoging (goed én fout) per toewijzing — audittrail voor de VCA-kennischeck.';

-- ── Indexen ───────────────────────────────────────────────────────────
create index if not exists toolbox_versies_toolbox_idx      on public.toolbox_versies(toolbox_id);
create index if not exists toolbox_momenten_toolbox_idx     on public.toolbox_momenten(toolbox_id);
create index if not exists toolbox_momenten_status_idx      on public.toolbox_momenten(status, datum);
create index if not exists toolbox_toewijzingen_toolbox_idx on public.toolbox_toewijzingen(toolbox_id);
create index if not exists toolbox_toewijzingen_mdw_idx     on public.toolbox_toewijzingen(medewerker_id, status);
create index if not exists toolbox_toewijzingen_task_idx    on public.toolbox_toewijzingen(task_id);
create index if not exists toolbox_antwoorden_toewijzing_idx on public.toolbox_antwoorden(toewijzing_id);

-- ── updated_at triggers ───────────────────────────────────────────────
create trigger toolboxen_bijgewerkt
  before update on public.toolboxen
  for each row execute function public.set_bijgewerkt_op();

create trigger toolbox_momenten_bijgewerkt
  before update on public.toolbox_momenten
  for each row execute function public.set_bijgewerkt_op();

create trigger toolbox_toewijzingen_bijgewerkt
  before update on public.toolbox_toewijzingen
  for each row execute function public.set_bijgewerkt_op();

-- ── RLS-baseline ──────────────────────────────────────────────────────
-- Schrijven loopt via de service-role client; deze baseline sluit anon uit.
do $$
declare t text;
begin
  foreach t in array array[
    'toolboxen','toolbox_versies','toolbox_momenten',
    'toolbox_toewijzingen','toolbox_antwoorden'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists app_authenticated_all on public.%I', t);
    execute format(
      'create policy app_authenticated_all on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ── Storage buckets ───────────────────────────────────────────────────
-- Content-afbeeldingen: publiek (intern lesmateriaal, geen expiry-gedoe
-- in editor en slides) — zelfde lijn als oplever-fotos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'toolbox-afbeeldingen', 'toolbox-afbeeldingen', true, 10485760,
  array['image/jpeg','image/jpg','image/png','image/webp','image/gif']
)
on conflict (id) do nothing;

-- Handtekeningen: privé (persoonsgegeven) — pad in DB, inzien via signed URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'toolbox-handtekeningen', 'toolbox-handtekeningen', false, 2097152,
  array['image/png']
)
on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Toolbox-afbeeldingen uploaden' and tablename = 'objects') then
    create policy "Toolbox-afbeeldingen uploaden"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'toolbox-afbeeldingen');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Toolbox-afbeeldingen verwijderen' and tablename = 'objects') then
    create policy "Toolbox-afbeeldingen verwijderen"
      on storage.objects for delete to authenticated
      using (bucket_id = 'toolbox-afbeeldingen');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Toolbox-handtekeningen lezen' and tablename = 'objects') then
    create policy "Toolbox-handtekeningen lezen"
      on storage.objects for select to authenticated
      using (bucket_id = 'toolbox-handtekeningen');
  end if;
end $$;
