-- =====================================================================
-- Form-inzending ↔ taak-koppeling
-- Koppelt een formulier-inzending aan een algemene taak (public.tasks),
-- zodat het invullen van een aan een taak gekoppeld formulier de taak
-- automatisch kan voltooien.
-- =====================================================================

alter table public.form_inzendingen
  add column if not exists task_id uuid references public.tasks(id) on delete set null;

create index if not exists form_inzendingen_task_idx
  on public.form_inzendingen(task_id);
