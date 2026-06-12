-- Losse taken: directe dossier-koppeling zonder actielijst.
-- Bij taken in een lijst loopt de koppeling via task_lists.dossier_id.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS dossier_id uuid NULL REFERENCES public.dossiers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_dossier_id ON public.tasks(dossier_id);

COMMENT ON COLUMN public.tasks.dossier_id IS
  'Directe dossier-koppeling voor losse taken zonder actielijst; bij taken in een lijst loopt de koppeling via task_lists.dossier_id';
