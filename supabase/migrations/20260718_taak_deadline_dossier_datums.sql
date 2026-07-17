-- =====================================================================
-- Deadline-anker per taak: verwachte start-/einddatum van het dossier
--
-- Tot nu toe hing het anker deadline_basis='streefdatum' aan één keuze op het sjabloon
-- (task_lists.streefdatum_bron, zie 20260717f). Daardoor volgden álle streefdatum-taken
-- van een checklist dezelfde dossier-datum: één taak op de verwachte startdatum en een
-- andere op de verwachte einddatum kon niet.
--
-- De twee dossier-datums worden nu gewone ankers naast planning_start/planning_eind,
-- zodat elke taak los kiest waar zijn deadline aan hangt:
--   verwacht_startdatum → dossiers.verwacht_startdatum (projectstart uit Bouw7)
--   verwacht_einddatum  → dossiers.verwacht_einddatum  (projecteind uit Bouw7)
--
-- 'streefdatum' blijft bestaan en betekent voortaan uitsluitend de datum die iemand bij
-- het handmatig activeren intypt (task_lists.streefdatum). streefdatum_bron vervalt: de
-- dossier-gebonden varianten zijn vervangen door de ankers hierboven en 'handmatig' was
-- toch al het gedrag zonder bron.
-- =====================================================================

-- ── 1. Nieuwe ankers toestaan ─────────────────────────────────────────

alter table public.tasks drop constraint if exists tasks_deadline_basis_check;
alter table public.tasks add constraint tasks_deadline_basis_check check (
  deadline_basis in (
    'geen','activatie','streefdatum','planning_start','planning_eind',
    'verwacht_startdatum','verwacht_einddatum'
  )
);

-- ── 2. Bestaande streefdatum-taken omzetten naar hun dossier-anker ────
-- Wat het sjabloon centraal bepaalde, komt nu op de taken zelf te staan. Zowel de
-- sjabloontaken als de al geactiveerde kopieën: die dragen hun eigen anker en worden
-- door de herberekening gelezen, dus zonder deze stap zouden ze terugvallen op een
-- streefdatum die er (op de trigger-route) nooit is.

update public.tasks t
   set deadline_basis = tl.streefdatum_bron
  from public.task_lists tl
 where t.lijst_id = tl.id
   and tl.is_template = true
   and tl.streefdatum_bron <> 'handmatig'
   and t.deadline_basis = 'streefdatum';

update public.tasks t
   set deadline_basis = sjabloon.streefdatum_bron
  from public.task_lists lijst
  join public.task_lists sjabloon on sjabloon.id = lijst.template_id
 where t.lijst_id = lijst.id
   and lijst.is_template = false
   and sjabloon.streefdatum_bron <> 'handmatig'
   and t.deadline_basis = 'streefdatum';

-- ── 3. Index: alle ankers die kunnen verschuiven ──────────────────────
-- 'activatie' hoort hier bewust niet bij: dat anker ligt na het activeren voorgoed vast.

drop index if exists tasks_deadline_basis_idx;
create index tasks_deadline_basis_idx
  on public.tasks (deadline_basis)
  where deadline_basis in (
    'planning_start','planning_eind','streefdatum','verwacht_startdatum','verwacht_einddatum'
  );

-- ── 4. streefdatum_bron buiten gebruik ────────────────────────────────
-- De kolom zelf gaat er pas in 20260718b uit, ná de deploy: tot dan draait er op
-- productie nog code die hem uitleest, en die zou op een ontbrekende kolom stuklopen.
-- Blijven staan kan zonder gevolgen — niets leest of schrijft hem meer en de kolom
-- heeft een default, dus inserts blijven werken.

comment on column public.task_lists.streefdatum_bron is
  'VERVALLEN — vervangen door deadline_basis=''verwacht_startdatum''/''verwacht_einddatum'' per taak. Wordt niet meer gelezen.';

comment on column public.task_lists.streefdatum is
  'Geactiveerde lijst: de streefdatum die bij het activeren is ingetypt. Anker voor taken met deadline_basis=''streefdatum''.';

comment on column public.tasks.deadline_basis is
  'Anker van de deadline: geen | activatie | streefdatum (ingetypt bij activeren) | '
  'planning_start | planning_eind (detailplanning) | verwacht_startdatum | verwacht_einddatum (dossier).';
