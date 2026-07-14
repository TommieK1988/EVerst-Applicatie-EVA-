-- Bouw7 → dossiers: offerte-herinneringen, interne notities en to-do's overhalen.
--
-- Offerte-herinneringen (GET /list/quotation-reminders) en de interne projectnotitie
-- (GET /project/{id}.note) worden als dossier-notitie geïmporteerd; open to-do's
-- (GET /list/todos) als taak. Deze migratie voegt de referentie-/dedupe-kolommen toe
-- zodat herhaalde syncs geen duplicaten aanmaken (check-before-upsert model, zoals
-- meerwerk_regels.bouw7_line_id).

-- ── dossier_notities: markeer herkomst uit Bouw7 ─────────────────────────────
alter table public.dossier_notities
  add column if not exists bouw7_bron text,
  add column if not exists bouw7_ref  text;

alter table public.dossier_notities drop constraint if exists dossier_notities_bouw7_bron_check;
alter table public.dossier_notities
  add constraint dossier_notities_bouw7_bron_check
  check (bouw7_bron is null or bouw7_bron in ('reminder','note'));

comment on column public.dossier_notities.bouw7_bron is
  'Herkomst bij import uit Bouw7: ''reminder'' (offerte-herinnering) of ''note'' (interne projectnotitie). NULL = handmatige EVA-notitie.';
comment on column public.dossier_notities.bouw7_ref is
  'Stabiele Bouw7-sleutel voor idempotente sync, bv. ''reminder:{id}'' of ''note:project''.';

-- Eén notitie per (dossier, Bouw7-bronitem): voorkomt duplicaten bij herhaalde sync.
create unique index if not exists dossier_notities_bouw7_ref_uidx
  on public.dossier_notities (dossier_id, bouw7_ref)
  where bouw7_ref is not null;

-- ── tasks: koppel geïmporteerde to-do aan Bouw7 ──────────────────────────────
alter table public.tasks
  add column if not exists bouw7_todo_id bigint;

comment on column public.tasks.bouw7_todo_id is
  'Bouw7 to-do id (GET /list/todos) waaruit deze taak is geïmporteerd. NULL = EVA-eigen taak.';

create unique index if not exists tasks_bouw7_todo_uidx
  on public.tasks (dossier_id, bouw7_todo_id)
  where bouw7_todo_id is not null;
