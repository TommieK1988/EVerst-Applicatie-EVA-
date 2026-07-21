-- =====================================================================
-- IFTTT-triggers vanuit het medewerkerdossier + medewerker-deadline-queue
--
-- Spiegel van het dossier-triggersysteem (20260610b_iftt_triggers.sql):
-- DB-triggers doen alleen write-path-agnostische change-detectie en
-- enqueuen een ruw oud/nieuw-snapshot; de Node-evaluator
-- (verwerkMedewerkerTriggers in taken/actions/sjablonen.ts) beslist welke
-- sjablonen met context='medewerker' geactiveerd worden.
--
-- Trigger-regels hergebruiken de bestaande tabel actielijst_triggers met
-- nieuwe event_type-waarden: medewerker_aangemaakt | medewerker_veld_waarde
-- | medewerker_datum_gezet | medewerker_attribuut.
--
-- De delta-check (IS DISTINCT FROM) is essentieel: de Bouw7-sync upsert
-- medewerkers in bulk en zou zonder die check elke run de queue volspammen.
-- =====================================================================

-- ── 1. Events-queue ───────────────────────────────────────────────────

create table if not exists public.medewerker_trigger_events (
  id            uuid        primary key default gen_random_uuid(),
  medewerker_id uuid        not null references public.medewerkers(id) on delete cascade,
  soort         text        not null,   -- medewerker_insert | medewerker_update | attribuut
  payload       jsonb       not null default '{}',  -- { oud, nieuw } of attribuut-velden
  status        text        not null default 'pending',  -- pending | processing | done | error
  foutmelding   text,
  created_at    timestamptz not null default now(),
  verwerkt_op   timestamptz
);

create index if not exists medewerker_trigger_events_pending_idx
  on public.medewerker_trigger_events (created_at)
  where status = 'pending';

create index if not exists medewerker_trigger_events_medewerker_idx
  on public.medewerker_trigger_events (medewerker_id);

alter table public.medewerker_trigger_events enable row level security;

drop policy if exists platform_gebruikers_all on public.medewerker_trigger_events;
create policy platform_gebruikers_all on public.medewerker_trigger_events
  for all to authenticated using (true) with check (true);

-- ── 2. Change-detectie op medewerkers ─────────────────────────────────

create or replace function public.tg_medewerker_trigger_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oud   jsonb;
  v_nieuw jsonb;
begin
  v_nieuw := jsonb_build_object(
    'actief',          NEW.actief,
    'extern',          NEW.extern,
    'functie',         NEW.functie,
    'afdeling',        NEW.afdeling,
    'in_dienst_vanaf', NEW.in_dienst_vanaf,
    'uit_dienst_per',  NEW.uit_dienst_per
  );

  if tg_op = 'INSERT' then
    insert into public.medewerker_trigger_events (medewerker_id, soort, payload)
    values (NEW.id, 'medewerker_insert', jsonb_build_object('oud', null, 'nieuw', v_nieuw));
    return null;
  end if;

  -- UPDATE: alleen enqueuen bij een daadwerkelijk gewijzigd gevolgd veld.
  v_oud := jsonb_build_object(
    'actief',          OLD.actief,
    'extern',          OLD.extern,
    'functie',         OLD.functie,
    'afdeling',        OLD.afdeling,
    'in_dienst_vanaf', OLD.in_dienst_vanaf,
    'uit_dienst_per',  OLD.uit_dienst_per
  );

  if v_oud is distinct from v_nieuw then
    insert into public.medewerker_trigger_events (medewerker_id, soort, payload)
    values (NEW.id, 'medewerker_update', jsonb_build_object('oud', v_oud, 'nieuw', v_nieuw));
  end if;

  return null;
end $$;

drop trigger if exists medewerker_trigger_events on public.medewerkers;
create trigger medewerker_trigger_events
  after insert or update on public.medewerkers
  for each row execute function public.tg_medewerker_trigger_events();

-- ── 3. Change-detectie op custom attribuutwaarden ─────────────────────

create or replace function public.tg_medewerker_attribuut_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and OLD.waarde is not distinct from NEW.waarde then
    return null;
  end if;

  insert into public.medewerker_trigger_events (medewerker_id, soort, payload)
  values (
    NEW.medewerker_id, 'attribuut',
    jsonb_build_object(
      'definitie_id', NEW.definitie_id,
      'oud_waarde',   case when tg_op = 'UPDATE' then OLD.waarde else null end,
      'nieuw_waarde', NEW.waarde
    )
  );
  return null;
end $$;

drop trigger if exists medewerker_attribuut_events on public.medewerker_attribuut_waarden;
create trigger medewerker_attribuut_events
  after insert or update on public.medewerker_attribuut_waarden
  for each row execute function public.tg_medewerker_attribuut_events();

-- ── 4. Deadline-herberekeningsqueue voor medewerker-ankers ────────────
-- Eigen queue naast taak_deadline_herberekeningen (die heeft dossier_id
-- als PK en kan dus geen medewerker-rijen bevatten). Gedraind door
-- herberekenMedewerkerDeadlines() in taken/actions/deadlines.ts.

create table if not exists public.medewerker_deadline_herberekeningen (
  medewerker_id uuid primary key references public.medewerkers(id) on delete cascade,
  status        text        not null default 'pending',
  aangemaakt_op timestamptz not null default now(),
  verwerkt_op   timestamptz,
  foutmelding   text,
  constraint medewerker_deadline_herberekeningen_status_check check (
    status in ('pending','processing','done','error')
  )
);

create index if not exists medewerker_deadline_herberekeningen_status_idx
  on public.medewerker_deadline_herberekeningen (status) where status = 'pending';

alter table public.medewerker_deadline_herberekeningen enable row level security;
drop policy if exists platform_gebruikers_all on public.medewerker_deadline_herberekeningen;
create policy platform_gebruikers_all on public.medewerker_deadline_herberekeningen
  for all to authenticated using (true) with check (true);

create or replace function public.tg_medewerker_datums_deadline_queue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.medewerker_deadline_herberekeningen (medewerker_id, status, aangemaakt_op)
  values (NEW.id, 'pending', now())
  on conflict (medewerker_id) do update
    set status        = 'pending',
        aangemaakt_op = now(),
        verwerkt_op   = null,
        foutmelding   = null;
  return null;
end $$;

drop trigger if exists tg_medewerker_datums_deadline_queue on public.medewerkers;
create trigger tg_medewerker_datums_deadline_queue
  after update on public.medewerkers
  for each row
  when (
    OLD.in_dienst_vanaf is distinct from NEW.in_dienst_vanaf or
    OLD.uit_dienst_per  is distinct from NEW.uit_dienst_per
  )
  execute function public.tg_medewerker_datums_deadline_queue();

-- ── 5. Reconcile: 'medewerker zelf'-taken koppelen zodra er een account is ──
-- Taken met assignee_type='medewerker_zelf' worden bij activatie aan
-- medewerkers.auth_user_id gekoppeld (resolveerToewijzingen in
-- lib/taken/kloon.ts). Heeft de medewerker dan nog geen account, dan blijft
-- de taak zonder assignee; deze trigger koppelt alsnog zodra auth_user_id
-- gevuld wordt (bv. na een uitnodiging). SQL-spiegel van
-- resolveerToewijzingen — houd beide in sync.

create or replace function public.fn_medewerker_zelf_taken_reconcile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.task_assignees (task_id, user_id, rol)
  select t.id, NEW.auth_user_id, 'verantwoordelijke'
  from public.tasks t
  left join public.task_lists l on l.id = t.lijst_id
  where t.assignee_type = 'medewerker_zelf'
    and t.status not in ('gereed','vervallen')
    and (
      t.medewerker_id = NEW.id
      or (l.medewerker_id = NEW.id and l.is_template = false)
    )
  on conflict (task_id, user_id) do nothing;
  return NEW;
end $$;

drop trigger if exists tg_medewerker_zelf_taken_reconcile on public.medewerkers;
create trigger tg_medewerker_zelf_taken_reconcile
  after update on public.medewerkers
  for each row
  when (
    OLD.auth_user_id is distinct from NEW.auth_user_id
    and NEW.auth_user_id is not null
  )
  execute function public.fn_medewerker_zelf_taken_reconcile();
