-- 20260619_o365_integraties.sql
--
-- Fundament voor de Office 365-integraties:
--   1. medewerker_o365_tokens   — tokentabel migratie-conform maken (bestond alleen impliciet)
--   2. dossier_bestanden        — tabel migratie-conform maken (stond alleen in types)
--   3. quote_layouts            — Word-template via SharePoint/OneDrive (Graph driveItem)
--   4. Taken ↔ Microsoft To Do  — mapping + per-gebruiker opt-in toggle
--   5. dossiers                 — SharePoint-map match-cache
--
-- Idempotent: veilig opnieuw te draaien.

-- ── 1. Tokentabel (historie kloppend maken) ────────────────────────────────────
create table if not exists public.medewerker_o365_tokens (
  medewerker_id    uuid primary key references public.medewerkers(id) on delete cascade,
  access_token     text not null,
  refresh_token    text,
  token_expires_at timestamptz,
  scopes           text[],
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── 2. Dossierbestanden ─────────────────────────────────────────────────────────
create table if not exists public.dossier_bestanden (
  id            uuid primary key default gen_random_uuid(),
  dossier_id    uuid not null references public.dossiers(id) on delete cascade,
  naam          text not null,
  url           text not null,
  categorie     text not null default '',
  bestandstype  text,
  grootte       integer,
  geupload_door uuid,
  bron          text,          -- bv. 'sharepoint' | 'upload'
  bron_id       text,          -- externe referentie, bv. SharePoint driveItem-id
  created_at    timestamptz not null default now()
);
create index if not exists idx_dossier_bestanden_dossier on public.dossier_bestanden(dossier_id);
create index if not exists idx_dossier_bestanden_bron on public.dossier_bestanden(bron, bron_id);

-- ── 3. Word-template via Graph (offerte-engine) ─────────────────────────────────
alter table public.quote_layouts
  add column if not exists docx_template_bron     text,  -- 'sharepoint' | 'onedrive' | null (=Supabase storage)
  add column if not exists docx_template_drive_id text,
  add column if not exists docx_template_item_id  text,
  add column if not exists docx_template_web_url  text;  -- "Bewerken in Word Online"-link

-- ── 4. Taken ↔ Microsoft To Do ──────────────────────────────────────────────────
create table if not exists public.task_todo_sync (
  id             uuid primary key default gen_random_uuid(),
  task_id        uuid not null references public.tasks(id) on delete cascade,
  medewerker_id  uuid not null references public.medewerkers(id) on delete cascade,
  todo_list_id   text not null,
  todo_task_id   text not null,
  eva_status     text,          -- laatst gesyncte EVA-status
  todo_completed boolean,       -- laatst geziene To Do-completion
  laatst_gesynct timestamptz,
  unique (task_id, medewerker_id)
);
create index if not exists idx_task_todo_sync_medewerker on public.task_todo_sync(medewerker_id);

alter table public.medewerker_o365_tokens
  add column if not exists todo_sync_actief boolean not null default false,  -- opt-in
  add column if not exists todo_list_id     text,
  add column if not exists todo_delta_link  text;  -- @odata.deltaLink voor delta-polling

-- ── 5. SharePoint-map match-cache op dossiers ───────────────────────────────────
alter table public.dossiers
  add column if not exists sharepoint_drive_id     text,
  add column if not exists sharepoint_item_id      text,  -- folder driveItem-id
  add column if not exists sharepoint_web_url      text,
  add column if not exists sharepoint_match_status text;  -- 'gematcht' | 'niet_gevonden' | 'meerdere' | null
