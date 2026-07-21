-- =====================================================================
-- Medewerker-context voor taken & actielijsten (naast de dossier-context)
--
-- Taken en actielijsten konden alleen aan een dossier hangen. Voor
-- personeelsprocessen (onboarding-/offboarding-checklists) moeten ze ook
-- aan een MEDEWERKER kunnen hangen, met dezelfde sjabloon-/triggermechaniek.
--
-- Ontwerp: een parallelle nullable kolom medewerker_id naast dossier_id
-- (nooit beide gevuld). Bewust géén generieke context_type/context_id en
-- bewust geen hergebruik van de legacy kolommen task_lists.entity_type/
-- entity_id: alle bestaande query-paden filteren op dossier_id en blijven
-- daardoor ongewijzigd werken — medewerker-rijen zijn daar simpelweg
-- onzichtbaar.
--
-- Sjablonen krijgen een expliciete context ('dossier' | 'medewerker') die
-- bepaalt welke trigger-events, toewijzingstypen en deadline-ankers de UI
-- aanbiedt en waar het sjabloon activeerbaar is.
-- =====================================================================

-- ── 1. task_lists: medewerker-koppeling + sjabloon-context ────────────

alter table public.task_lists
  add column if not exists medewerker_id uuid references public.medewerkers(id) on delete cascade,
  add column if not exists context text not null default 'dossier';

do $$ begin
  alter table public.task_lists add constraint task_lists_context_check
    check (context in ('dossier','medewerker'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.task_lists add constraint task_lists_een_context_check
    check (not (dossier_id is not null and medewerker_id is not null));
exception when duplicate_object then null; end $$;

create index if not exists task_lists_medewerker_idx
  on public.task_lists (medewerker_id) where medewerker_id is not null;

comment on column public.task_lists.context is
  'Sjabloon-context: dossier | medewerker. Bepaalt beschikbare triggers, toewijzingen en deadline-ankers.';

-- ── 2. tasks: losse taken aan een medewerker + medewerker-ankers ──────

alter table public.tasks
  add column if not exists medewerker_id uuid references public.medewerkers(id) on delete cascade;

do $$ begin
  alter table public.tasks add constraint tasks_een_context_check
    check (not (dossier_id is not null and medewerker_id is not null));
exception when duplicate_object then null; end $$;

create index if not exists tasks_medewerker_idx
  on public.tasks (medewerker_id) where medewerker_id is not null;

-- Nieuwe deadline-ankers: datums van de medewerker zelf (bv. "14 dagen
-- vóór uit dienst"). Zelfde herberekeningsmechaniek als de dossier-ankers.
alter table public.tasks drop constraint if exists tasks_deadline_basis_check;
alter table public.tasks add constraint tasks_deadline_basis_check check (
  deadline_basis in (
    'geen','activatie','streefdatum','planning_start','planning_eind',
    'verwacht_startdatum','verwacht_einddatum','in_dienst_vanaf','uit_dienst_per'
  )
);

-- 'activatie' blijft bewust buiten de index: dat anker ligt voorgoed vast.
drop index if exists tasks_deadline_basis_idx;
create index tasks_deadline_basis_idx
  on public.tasks (deadline_basis)
  where deadline_basis in (
    'planning_start','planning_eind','streefdatum','verwacht_startdatum',
    'verwacht_einddatum','in_dienst_vanaf','uit_dienst_per'
  );

comment on column public.tasks.deadline_basis is
  'Anker van de deadline: geen | activatie | streefdatum (ingetypt bij activeren) | '
  'planning_start | planning_eind (detailplanning) | verwacht_startdatum | verwacht_einddatum (dossier) | '
  'in_dienst_vanaf | uit_dienst_per (medewerker).';

-- ── 3. actielijst_activeringen: idempotentie per (sjabloon, medewerker) ──

alter table public.actielijst_activeringen alter column dossier_id drop not null;

alter table public.actielijst_activeringen
  add column if not exists medewerker_id uuid references public.medewerkers(id) on delete cascade;

do $$ begin
  alter table public.actielijst_activeringen add constraint actielijst_activeringen_context_check
    check (num_nonnulls(dossier_id, medewerker_id) = 1);
exception when duplicate_object then null; end $$;

-- LET OP: de bestaande UNIQUE(template_id, dossier_id) beschermt rijen met
-- dossier_id NULL niet (NULL is nooit gelijk aan NULL). Daarom een tweede,
-- gewone unique-constraint — gewoon i.p.v. partieel, omdat de PostgREST-
-- upsert (onConflict) alleen echte constraints kan infereren. Dossier-rijen
-- (medewerker_id NULL) botsen hier nooit op.
do $$ begin
  alter table public.actielijst_activeringen add constraint actielijst_activeringen_uniek_medewerker
    unique (template_id, medewerker_id);
exception when duplicate_object then null; end $$;

create index if not exists actielijst_activeringen_medewerker_idx
  on public.actielijst_activeringen (medewerker_id) where medewerker_id is not null;
