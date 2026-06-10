-- Taken verbeteringen: taak-afhankelijkheden (blokkering door voorganger)

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS blocked_by_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_blocked_by_idx ON public.tasks (blocked_by_task_id)
  WHERE blocked_by_task_id IS NOT NULL;
