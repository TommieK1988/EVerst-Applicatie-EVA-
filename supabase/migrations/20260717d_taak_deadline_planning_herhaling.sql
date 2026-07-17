-- =====================================================================
-- Actielijst-sjablonen: deadline-ankers op de detailplanning + herhaling
--
-- 1. Deadline van een sjabloontaak krijgt een expliciet ANKER (deadline_basis)
--    met een ondertekende offset in dagen (deadline_dagen; negatief = ervóór).
--    Nieuw t.o.v. de oude situatie zijn de ankers 'planning_start' en
--    'planning_eind': de vroegste start en laatste eind van de detailplanning
--    van het dossier (zie functie planning_datums_per_dossier()).
--
-- 2. Een sjabloontaak kan HERHALEN gedurende de uitvoering (het venster van de
--    detailplanning), bv. 1× per week. Bij activatie ontstaat er één losse taak
--    per keer; die zijn herkenbaar aan herhaling_bron_taak_id + herhaling_index.
--
-- 3. De detailplanning bestaat bij activatie vaak nog niet en schuift later.
--    Daarom signaleert een trigger op planning_items write-path-agnostisch dát
--    er iets wijzigde (ook bij een Bouw7-sync); de Node-drain
--    herberekenDeadlines() rekent de ankers opnieuw uit en stemt de
--    herhaal-taken af. Zelfde patroon als actielijst_activeringen.
-- =====================================================================

-- ── 1. Deadline-anker + herhaling op tasks ────────────────────────────

alter table public.tasks
  add column if not exists deadline_basis         text    not null default 'geen',
  add column if not exists deadline_dagen         integer,
  -- Handmatig gezette deadline: de herberekening laat deze taak met rust.
  add column if not exists deadline_handmatig     boolean not null default false,
  add column if not exists herhaling_interval     text    not null default 'geen',
  -- Op een gegenereerde herhaal-taak: de sjabloontaak waaruit hij ontstond.
  add column if not exists herhaling_bron_taak_id uuid references public.tasks(id) on delete cascade,
  -- Hoeveelste keer (0-based). Stabiel bij het schuiven van de planning: de
  -- taak blijft bestaan en krijgt een nieuwe deadline, i.p.v. weggegooid worden.
  add column if not exists herhaling_index        smallint;

do $$ begin
  alter table public.tasks add constraint tasks_deadline_basis_check check (
    deadline_basis in ('geen','activatie','streefdatum','planning_start','planning_eind')
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.tasks add constraint tasks_herhaling_interval_check check (
    herhaling_interval in ('geen','werkdagen','wekelijks','tweewekelijks','maandelijks')
  );
exception when duplicate_object then null; end $$;

create unique index if not exists tasks_herhaling_occurrence_idx
  on public.tasks (lijst_id, herhaling_bron_taak_id, herhaling_index)
  where herhaling_bron_taak_id is not null;

create index if not exists tasks_deadline_basis_idx
  on public.tasks (deadline_basis)
  where deadline_basis in ('planning_start','planning_eind');

-- ── 2. Backfill vanuit de twee oude kolommen ──────────────────────────
-- max_doorlooptijd_dagen = N dagen ná activatie; deadline_offset_dagen = N dagen
-- vóór de streefdatum (vandaar het minteken).

update public.tasks
   set deadline_basis = 'activatie',
       deadline_dagen = max_doorlooptijd_dagen
 where deadline_basis = 'geen'
   and max_doorlooptijd_dagen is not null;

update public.tasks
   set deadline_basis = 'streefdatum',
       deadline_dagen = -deadline_offset_dagen
 where deadline_basis = 'geen'
   and deadline_offset_dagen is not null;

comment on column public.tasks.max_doorlooptijd_dagen is
  'VERVALLEN — vervangen door deadline_basis=''activatie'' + deadline_dagen. Alleen nog historie.';
comment on column public.tasks.deadline_offset_dagen is
  'VERVALLEN — vervangen door deadline_basis=''streefdatum'' + deadline_dagen. Alleen nog historie.';
comment on column public.tasks.deadline_dagen is
  'Ondertekende offset in dagen t.o.v. deadline_basis: negatief = ervóór, positief = erná.';

-- ── 3. Wachtrij: dossiers waarvan de deadlines herberekend moeten worden ──

create table if not exists public.taak_deadline_herberekeningen (
  dossier_id    uuid primary key references public.dossiers(id) on delete cascade,
  status        text        not null default 'pending',
  aangemaakt_op timestamptz not null default now(),
  verwerkt_op   timestamptz,
  foutmelding   text,
  constraint taak_deadline_herberekeningen_status_check check (
    status in ('pending','processing','done','error')
  )
);
create index if not exists taak_deadline_herberekeningen_status_idx
  on public.taak_deadline_herberekeningen (status) where status = 'pending';

alter table public.taak_deadline_herberekeningen enable row level security;
drop policy if exists app_authenticated_all on public.taak_deadline_herberekeningen;
create policy app_authenticated_all on public.taak_deadline_herberekeningen
  for all to authenticated using (true) with check (true);

-- ── 4. Trigger: planning gewijzigd → dossier op de wachtrij ───────────
-- Write-path-agnostisch: vangt zowel de planning-UI als de Bouw7-planningsync.

create or replace function public.tg_planning_items_deadline_queue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activiteit uuid;
  v_dossier    uuid;
begin
  -- NEW bestaat niet bij DELETE (en OLD niet bij INSERT); daarom expliciet op TG_OP.
  if tg_op = 'DELETE' then
    v_activiteit := old.activiteit_id;
  else
    v_activiteit := new.activiteit_id;
  end if;

  select pa.dossier_id into v_dossier
    from public.planning_activiteiten pa
   where pa.id = v_activiteit;

  -- Null wanneer de activiteit al weg is (bv. cascade bij dossier-verwijdering):
  -- dan valt er ook niets te herberekenen.
  if v_dossier is not null then
    insert into public.taak_deadline_herberekeningen (dossier_id, status, aangemaakt_op)
    values (v_dossier, 'pending', now())
    on conflict (dossier_id) do update
      set status        = 'pending',
          aangemaakt_op = now(),
          verwerkt_op   = null,
          foutmelding   = null;
  end if;

  return null;
end $$;

drop trigger if exists tg_planning_items_deadline_queue on public.planning_items;
create trigger tg_planning_items_deadline_queue
  after insert or delete or update of start_dt, eind_dt
  on public.planning_items
  for each row execute function public.tg_planning_items_deadline_queue();
