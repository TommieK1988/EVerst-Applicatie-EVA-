-- Actielijst sjablonen: triggers, dossier-koppeling, roltoewijzing, deadline-offsets, voltooiingsacties

-- ─── task_lists uitbreiden ────────────────────────────────────────────────────

ALTER TABLE public.task_lists
  ADD COLUMN IF NOT EXISTS dossier_id             uuid REFERENCES public.dossiers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS trigger_hoofdstatus    text,
  ADD COLUMN IF NOT EXISTS trigger_substatus      text,
  ADD COLUMN IF NOT EXISTS template_id            uuid REFERENCES public.task_lists(id) ON DELETE SET NULL;

-- trigger_hoofdstatus: 'aanvraag' | 'offerte' | 'opdracht' | NULL (= alleen handmatig)
-- trigger_substatus:   specifieke substatus die activatie triggert, bv. 'gewonnen', 'werkopname'
-- template_id:         verwijst naar het sjabloon waaruit deze instantie is gemaakt (NULL = geen instantie)

CREATE INDEX IF NOT EXISTS task_lists_dossier_idx
  ON public.task_lists (dossier_id)
  WHERE dossier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS task_lists_trigger_idx
  ON public.task_lists (trigger_hoofdstatus, trigger_substatus)
  WHERE is_template = true;

CREATE INDEX IF NOT EXISTS task_lists_template_id_idx
  ON public.task_lists (template_id)
  WHERE template_id IS NOT NULL;

-- ─── tasks uitbreiden ─────────────────────────────────────────────────────────

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assignee_type          text NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS dossier_rol            text,
  ADD COLUMN IF NOT EXISTS max_doorlooptijd_dagen integer,
  ADD COLUMN IF NOT EXISTS deadline_offset_dagen  integer;

-- assignee_type:          'direct' | 'dossier_rol'
-- dossier_rol:            kolomnaam op dossiers-tabel, bv. 'project_manager_id'
-- max_doorlooptijd_dagen: bij activatie → deadline = activatiedatum + N dagen
-- deadline_offset_dagen:  bij activatie → deadline = streefdatum - N dagen (streefdatum opgegeven bij activatie)

-- ─── task_completion_acties ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.task_completion_acties (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       uuid        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  volgorde      integer     NOT NULL DEFAULT 0,
  actie_type    text        NOT NULL,
  config        jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- actie_type waarden en bijbehorende config-shapes:
--   'dossier_substatus_wijzigen'  → { nieuwe_substatus: string }
--   'dossier_rol_toewijzen'       → { dossier_veld: string, medewerker_id: string }
--   'notificatie_sturen'          → { bericht: string, aan: 'assignees' | 'projectleider' }
--   'sjabloon_activeren'          → { template_id: string }

CREATE INDEX IF NOT EXISTS task_completion_acties_task_idx
  ON public.task_completion_acties (task_id);
