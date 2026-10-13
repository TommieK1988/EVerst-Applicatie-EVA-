-- 20261009b_todo_import.sql
--
-- Microsoft To Do → EVA-acties.
--
-- Richting: taken die een medewerker in To Do (of Outlook) aanmaakt, verschijnen in
-- "Mijn acties". EVA-eigen acties gaan níet naar To Do. Voor een actie die uit To Do
-- komt, blijven status, titel en deadline aan beide kanten gelijk.
--
-- De tabel task_todo_sync (20260619) was bedoeld voor de omgekeerde richting en is
-- nooit gevuld; hij wordt hier de koppeltabel per geïmporteerde actie.
--
-- Additief: veilig vóór de code op main staat.

-- ── Lijsten per medewerker ─────────────────────────────────────────────────────
create table if not exists public.medewerker_todo_lijsten (
  id              uuid primary key default gen_random_uuid(),
  medewerker_id   uuid not null references public.medewerkers(id) on delete cascade,
  todo_list_id    text not null,
  naam            text not null,
  wellknown_name  text,                         -- 'defaultList' | 'none' (flaggedEmails slaan we over)
  actief          boolean not null default true, -- door de medewerker uit te zetten
  delta_link      text,                         -- @odata.deltaLink van de laatste ronde
  laatst_gesynct  timestamptz,
  created_at      timestamptz not null default now(),
  unique (medewerker_id, todo_list_id)
);
alter table public.medewerker_todo_lijsten enable row level security;

-- ── Koppeling per actie ────────────────────────────────────────────────────────
alter table public.task_todo_sync
  add column if not exists todo_gewijzigd_op timestamptz;   -- laatst geziene lastModifiedDateTime

create unique index if not exists task_todo_sync_task_uidx
  on public.task_todo_sync(task_id);
create unique index if not exists task_todo_sync_todo_uidx
  on public.task_todo_sync(medewerker_id, todo_task_id);
alter table public.task_todo_sync enable row level security;

-- ── Herkomst op de actie zelf ──────────────────────────────────────────────────
-- Naam van de To Do-lijst; NULL = geen To Do-actie. Zelfde idee als bouw7_todo_id:
-- herkomstlabel en groepering zien het zonder join.
alter table public.tasks
  add column if not exists todo_lijst_naam text;
